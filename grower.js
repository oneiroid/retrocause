// The automatic grower: from one node, expand a story DAG with a chat model.
// Node-only, like llm_client.js: it drives HTTP, so the page gets its output
// through the bridge (tools/grow_server.js).
//
// One expansion is one model call that writes `width` alternatives at once. A
// chat model reads the instruction, so diversity is asked for rather than drawn
// call by call, and the cost per node falls to a few seconds of generation
// shared with `width - 1` siblings. Expansions run concurrently, one per server
// slot, from a work queue ordered by depth, so slots stay busy across depth
// boundaries.
//
// Judge calls are concurrent too, and optimistic: a candidate is asked about the
// nodes that look like it, and inserted only in a synchronous step that finds
// nothing new to ask about. So a merge decision sees every node inserted before
// it, and two parallel expansions cannot both add the same state unasked.

"use strict";

const Engine = require("./story_builder_engine.js");
const Growth = require("./growth.js");
const Predicate = require("./merge_predicate.js");
const Ids = require("./ids.js");
const Facts = require("./facts.js");
const { createJudge, createFutureJudge, createCritic } = require("./judges.js");

// Generation budget per alternative; a line runs to about 35 tokens.
const TOKENS_PER_ALTERNATIVE = 80;
const EXPR_MAX_CHARS = 80;
// Sampling temperature: high enough that re-growing a node gives other events,
// low enough that the format holds.
const DEFAULT_TEMPERATURE = 0.8;
// The Lab's progress feed is refreshed at most this often.
const PROGRESS_INTERVAL_MS = 200;
const FALLBACK_CONCURRENCY = 1;
// Merge targets one candidate may put to the judge, in all. Each is a model call
// whose prompt evaluation stalls every running generation: judging took 65% of a
// 400-node run. Over 425 candidates, the top proposal alone held 38 of 45 merges.
const MAX_JUDGED_PER_CANDIDATE = 1;
// A path longer than this keeps its opening and its most recent events, so a
// deep expansion still fits a server slot's context.
const MAX_PATH_EVENTS = 40;
const PATH_HEAD_EVENTS = 5;

// Merge modes. "facts": a candidate whose folded world equals a node's merges
// into it with no model call; one that differs from a node in at most
// NEAR_FACTS facts is put to the future judge. "routes": the earlier judge,
// which compares the routes and so refuses two routes into one situation by
// design; kept for comparison. "off": a plain tree.
const MERGE_MODES = ["facts", "routes", "off"];
// Two, so a fact renamed on the way (a.scared=yes against a.afraid=yes) is near.
const NEAR_FACTS = 2;

const DEFAULTS = {
  depth: 4, width: 3, beam: 8, maxNodes: 60, merge: "facts", prune: false, temperature: DEFAULT_TEMPERATURE,
};

// `true` and `false` from older callers: on is "facts".
function mergeMode(value) {
  if (value === true || value === undefined || value === null) return "facts";
  if (value === false) return "off";
  if (!MERGE_MODES.includes(value)) throw new Error(`unknown merge mode: ${value}`);
  return value;
}

// The story so far as the model reads it. The path comes first and the request
// last, so siblings and cousins share an evaluated prefix on the server.
// `world`: the source's folded facts; folded here from the graph when not given.
function storySoFar(graph, sourceId, world = null) {
  if (!world) world = Facts.worldsOf(graph).get(sourceId) || null;
  const vocabulary = Facts.vocabularyOf(graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const title = graph.title || (graph.meta && graph.meta.title) || "Untitled";
  const entities = Array.isArray(graph.entities) ? graph.entities : [];
  const path = Engine.ancestorPath(graph, sourceId).map((id) => byId.get(id)).filter(Boolean);
  const lines = path.map((n, i) => `${i + 1}. ${n.label || n.expr}`);
  const events = (lines.length > MAX_PATH_EVENTS
    ? [...lines.slice(0, PATH_HEAD_EVENTS), "...", ...lines.slice(PATH_HEAD_EVENTS - MAX_PATH_EVENTS)]
    : lines).join("\n");
  return [
    `Story: ${title}`,
    ...(entities.length ? [`Characters: ${entities.join(", ")}`] : []),
    "",
    "Events so far:",
    events,
    "",
    ...(world && world.size
      ? ["World now:", Facts.renderWorld(world)]
      : [`World state now: ${(path.at(-1) || {}).state || "(not stated)"}`]),
    ...(vocabulary.length ? ["", `Fact keys in this story: ${vocabulary.join(", ")}`] : []),
  ].join("\n");
}

function expansionRequest(graph, source, width, template, world = null) {
  const story = storySoFar(graph, source.id, world);
  return {
    story,
    system: String(template).replaceAll("{{width}}", String(width)).trim(),
    user: `${story}\n\nWrite ${width} lines.`,
  };
}

// A grown node's `expr`: its event as a slug. The surface key still works on it,
// and the model does not spend a quarter of its tokens on a formal action nothing
// downstream reads.
function exprOf(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, EXPR_MAX_CHARS);
}

// The model sometimes shouts a whole event. Capitalized first letter, otherwise
// as written, unless it is all caps.
function sentenceCase(text) {
  const s = String(text).trim();
  const body = s === s.toUpperCase() ? s.toLowerCase() : s;
  return body.replace(/^(.)/, (c) => c.toUpperCase());
}

const LIST_MARKER = /^[\s*>#-]*(\d+[.)]\s*)?/;
const FIELD_SEPARATOR = /\s*\|\s*/;
const END_MARK = /^end\b/i;

// The alternatives in a completion: `event | changes`, or `event | changes | end`,
// where changes are `owner.property=value` facts. A second field with no fact in
// it is read as a prose state (the older format), and the alternative carries no
// effects. A non-empty line without both fields is a fragment (the tail of a
// length stop, say), counted as malformed by the caller.
function parseAlternatives(content) {
  const alternatives = [];
  let malformed = 0;
  for (const raw of String(content).split("\n")) {
    const line = raw.replace(LIST_MARKER, "").trim();
    if (!line) continue;
    const [event, state, mark] = line.split(FIELD_SEPARATOR);
    if (!event || !state || END_MARK.test(state)) {
      malformed += 1;
      continue;
    }
    const label = sentenceCase(event);
    const { pairs } = Facts.parseEffects(state);
    const effects = pairs.length ? Facts.formatEffects(pairs) : "";
    alternatives.push({ label, expr: exprOf(label), state: effects || state, effects, changes: pairs, ending: END_MARK.test(mark || "") });
  }
  return { alternatives, malformed };
}

// How many expansions a run can reach at most, for the progress bar. A run that
// merges, prunes or hits endings finishes under it.
function plannedExpansions({ depth, width, beam, maxNodes }) {
  let total = 0;
  for (let d = 0; d < depth; d += 1) total += Math.min(beam || Infinity, width ** d);
  return Math.min(total, Math.ceil(maxNodes / width));
}

// One model call, for the grower and for the Lab's "propose" list.
async function proposeAlternatives({ graph, source, width, temperature, client, template, signal, onToken, world = null }) {
  const request = expansionRequest(graph, source, width, template, world);
  const completion = await client.chat({
    system: request.system,
    user: request.user,
    temperature,
    maxTokens: TOKENS_PER_ALTERNATIVE * width,
    signal,
    onToken,
  });
  const { alternatives, malformed } = parseAlternatives(completion.content);
  return { ...request, ...completion, alternatives, malformed };
}

// Grows `graph` from `from`. Returns { graph, stats, validation, trace, error }
// and never rejects on a model failure: what was grown before it is the user's,
// and `error` says what stopped the run.
//
// `templates` = { branch, same, critic }. `beam` caps expansions per depth, the
// knob that buys depth: at width 3, a beam of 8 reaches depth 10 in 70 calls
// where a full tree spends 29524. `onEvent` receives
//   { type: "node" | "merge" | "pruned" | "expansion" | "progress", ... }.
async function growGraph({
  graph: inputGraph,
  client,
  templates,
  from,
  depth = DEFAULTS.depth,
  width = DEFAULTS.width,
  beam = DEFAULTS.beam,
  maxNodes = DEFAULTS.maxNodes,
  merge = DEFAULTS.merge,
  prune = DEFAULTS.prune,
  temperature = DEFAULTS.temperature,
  concurrency = FALLBACK_CONCURRENCY,
  runId = null,
  signal = null,
  onEvent = () => {},
} = {}) {
  const graph = Engine.normalizeGraph(inputGraph);
  if (!graph.nodes.some((n) => n.id === from)) throw new Error(`from node not in graph: ${from}`);
  const mode = mergeMode(merge);

  const stats = {
    mergeMode: mode,
    created: 0,
    merged: 0,
    // Of `merged`: on an equal folded world, with no model call; and by a judge.
    mergedOnFacts: 0,
    mergedByJudge: 0,
    mergesRefused: 0,
    judgeCalls: 0,
    // Candidates whose world equals a node on their own route: a return to an
    // earlier state, kept as a new node because an edge back would be a cycle.
    recurrences: 0,
    // Alternatives written without facts, so they cannot merge on them.
    withoutFacts: 0,
    pruned: 0,
    nullTransitions: 0,
    malformed: 0,
    truncated: 0,
    expansions: 0,
    endings: 0,
    toldNext: 0,
    alternatives: 0,
    tokens: 0,
    maxDepth: 0,
    // Nodes left unexpanded because their depth had used up the beam.
    beamDropped: 0,
    // Nodes with more than one way in, at the end: the convergences.
    convergent: 0,
    elapsedMs: 0,
    stopped: false,
  };
  const trace = [];
  const started = Date.now();
  const planned = plannedExpansions({ depth, width, beam, maxNodes });

  // A model failure aborts the expansions in flight along with a user's stop.
  const internal = new AbortController();
  const onUserStop = () => internal.abort();
  if (signal) {
    if (signal.aborted) internal.abort();
    else signal.addEventListener("abort", onUserStop, { once: true });
  }
  let error = null;

  const judge = mode === "routes" ? createJudge({ client, system: templates.same, signal: internal.signal }) : null;
  const futureJudge = mode === "facts" && templates.future
    ? createFutureJudge({ client, system: templates.future, signal: internal.signal })
    : null;
  const critic = prune ? createCritic({ client, system: templates.critic, signal: internal.signal }) : null;

  // ── worlds ────────────────────────────────────────────────────────────────
  // Each node's folded world, and the nodes that hold each world. Only nodes
  // that state facts are indexed: a node without effects inherits its parent's
  // world, and merging into it would be merging into its parent.
  const worlds = Facts.worldsOf(graph);
  const byWorld = new Map();
  const indexWorld = (node) => {
    if (!Facts.effectsOf(node).length && node.kind !== "root") return;
    const key = Facts.worldKey(worlds.get(node.id));
    if (!key) return;
    if (!byWorld.has(key)) byWorld.set(key, []);
    byWorld.get(key).push(node.id);
  };
  graph.nodes.forEach(indexWorld);
  const ancestorsOf = (id) => {
    const seen = new Set([id]);
    for (let frontier = [id]; frontier.length;) {
      const next = [];
      graph.edges.forEach((e) => {
        if (frontier.includes(e.to) && !seen.has(e.from)) {
          seen.add(e.from);
          next.push(e.from);
        }
      });
      frontier = next;
    }
    return seen;
  };
  // Indexed nodes whose world differs from `world` in 1..NEAR_FACTS facts, fewest
  // first. A linear scan: a run's cap is 1000 nodes.
  const nearWorlds = (world, excluded) => {
    const near = [];
    byWorld.forEach((ids) => {
      const other = worlds.get(ids[0]);
      const diff = Facts.worldDiff(world, other);
      if (diff.length >= 1 && diff.length <= NEAR_FACTS) {
        ids.filter((id) => !excluded.has(id)).forEach((id) => near.push({ id, diff }));
      }
    });
    return near.sort((a, b) => (a.diff.length - b.diff.length) || String(a.id).localeCompare(String(b.id)));
  };

  // ── progress ──────────────────────────────────────────────────────────────
  const live = new Map();
  let lastProgress = 0;
  function progress(force = false) {
    const now = Date.now();
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return;
    lastProgress = now;
    const elapsedMs = now - started;
    onEvent({
      type: "progress",
      planned,
      queued: queue.length,
      elapsedMs,
      tokensPerSecond: elapsedMs ? stats.tokens / (elapsedMs / 1000) : 0,
      stats: { ...stats, elapsedMs },
      active: [...live.values()],
    });
  }

  // ── insertion ─────────────────────────────────────────────────────────────
  const tellsNext = (sourceId, expr) => {
    const key = Ids.normalizedContent(expr);
    return graph.edges.some((e) => {
      if (e.from !== sourceId) return false;
      const child = graph.nodes.find((n) => n.id === e.to);
      return child && child.createdBy !== "grown" && Ids.normalizedContent(child.expr) === key;
    });
  };

  function mergeInto(sourceId, intoId, node, how, extra = {}) {
    const edge = Growth.rejoin(graph, { from: sourceId, into: intoId, label: extra.edgeLabel || how });
    stats.merged += 1;
    if (how === "same world") stats.mergedOnFacts += 1;
    else stats.mergedByJudge += 1;
    onEvent({ type: "merge", from: sourceId, into: intoId, edge, label: node.label, how, ...extra });
  }

  async function insertCandidate(sourceId, itemDepth, candidate, index, record) {
    if (stats.created >= maxNodes) return;
    const source = graph.nodes.find((n) => n.id === sourceId);
    const node = {
      label: candidate.label,
      kind: "branch",
      expr: candidate.expr,
      state: candidate.state,
      ...(candidate.effects ? { effects: candidate.effects } : {}),
      tags: candidate.ending ? ["counterfactual", "ending"] : ["counterfactual"],
      createdBy: "grown",
      ...(runId ? { runId } : {}),
    };
    if (Growth.isNullTransition(source, node)) {
      stats.nullTransitions += 1;
      return;
    }
    const sourceWorld = worlds.get(sourceId) || new Map();
    const world = Facts.fold(sourceWorld, candidate.changes || []);
    const key = candidate.changes && candidate.changes.length ? Facts.worldKey(world) : "";
    if (!key) stats.withoutFacts += 1;
    // An event that changes no fact changes nothing the grower can see.
    if (key && key === Facts.worldKey(sourceWorld)) {
      stats.nullTransitions += 1;
      return;
    }
    if (tellsNext(sourceId, node.expr)) stats.toldNext += 1;

    // Everything from the last check to the insert below runs without an await,
    // so no node can slip in between "nothing left to ask" and the insert.
    if (mode === "facts" && key) {
      const asked = new Set();
      for (;;) {
        const route = ancestorsOf(sourceId);
        const holders = byWorld.get(key) || [];
        const same = holders.find((id) => !route.has(id));
        if (same) {
          mergeInto(sourceId, same, node, "same world");
          return;
        }
        if (holders.length) stats.recurrences += 1;
        if (!futureJudge || asked.size >= MAX_JUDGED_PER_CANDIDATE) break;
        const [near] = nearWorlds(world, new Set([...route, ...asked]));
        if (!near) break;
        asked.add(near.id);
        stats.judgeCalls += 1;
        const target = graph.nodes.find((n) => n.id === near.id);
        const verdict = await futureJudge({
          graph, a: { node, world }, b: { node: target, world: worlds.get(near.id) }, diff: near.diff,
        });
        record.judgements.push({ label: node.label, survivor: near.id, kind: "future", ...verdict });
        if (verdict.same) {
          mergeInto(sourceId, near.id, node, "same future", { pYes: verdict.pYes, edgeLabel: `same future, P=${verdict.pYes.toFixed(2)}` });
          return;
        }
        stats.mergesRefused += 1;
        if (stats.created >= maxNodes) return;
      }
    } else if (judge) {
      const asked = new Set();
      for (;;) {
        const open = Predicate.mergeProposals(graph, sourceId, node).filter((id) => !asked.has(id));
        if (!open.length || asked.size >= MAX_JUDGED_PER_CANDIDATE) break;
        const batch = open.slice(0, MAX_JUDGED_PER_CANDIDATE - asked.size);
        batch.forEach((id) => asked.add(id));
        stats.judgeCalls += batch.length;
        const verdicts = await Promise.all(batch.map((id) => judge(graph, id, sourceId, node)));
        let same = null;
        verdicts.forEach((verdict, i) => {
          record.judgements.push({ label: node.label, survivor: batch[i], kind: "routes", ...verdict });
          if (verdict.same && (!same || verdict.pYes > same.verdict.pYes)) same = { id: batch[i], verdict };
          if (!verdict.same) stats.mergesRefused += 1;
        });
        if (same) {
          mergeInto(sourceId, same.id, node, "same point", { pYes: same.verdict.pYes, edgeLabel: `same point, P=${same.verdict.pYes.toFixed(2)}` });
          return;
        }
        if (stats.created >= maxNodes) return;
      }
    }

    const { node: created, edge } = Growth.attach(graph, { from: sourceId, node, type: "choice" });
    worlds.set(created.id, key ? world : sourceWorld);
    if (key) indexWorld(created);
    stats.created += 1;
    stats.maxDepth = Math.max(stats.maxDepth, itemDepth + 1);
    if (candidate.ending) stats.endings += 1;
    onEvent({ type: "node", from: sourceId, node: created, edge, depth: itemDepth + 1 });
    if (!candidate.ending && itemDepth + 1 < depth) {
      queue.push({ id: created.id, depth: itemDepth + 1, order: index });
    }
  }

  async function expand(item) {
    const source = graph.nodes.find((n) => n.id === item.id);
    const entry = { from: item.id, label: source.label, text: "", tokens: 0 };
    live.set(item.id, entry);
    progress();
    const known = worlds.get(item.id);
    const proposal = await proposeAlternatives({
      graph, source, width, temperature, client, template: templates.branch, signal: internal.signal,
      world: known && known.size ? known : null,
      onToken: (piece, text) => {
        entry.text = text;
        entry.tokens += 1;
        stats.tokens += 1;
        progress();
      },
    });
    live.delete(item.id);
    stats.expansions += 1;
    stats.alternatives += proposal.alternatives.length;
    stats.malformed += proposal.malformed;
    if (proposal.finishReason === "length") stats.truncated += 1;

    const record = {
      from: item.id,
      system: proposal.system,
      user: proposal.user,
      completion: proposal.content,
      promptTokens: proposal.promptTokens,
      cachedTokens: proposal.cachedTokens,
      judgements: [],
    };
    trace.push(record);

    let kept = proposal.alternatives;
    if (critic && kept.length) {
      const review = await critic(proposal.story, kept);
      stats.tokens += review.tokens;
      record.critic = { system: templates.critic, user: review.user, completion: review.content };
      kept = kept.filter((candidate, i) => {
        const { bad } = review.verdicts[i];
        if (!bad) return true;
        stats.pruned += 1;
        onEvent({ type: "pruned", from: item.id, label: candidate.label, reason: bad });
        return false;
      });
    }

    await Promise.all(kept.map((candidate, index) => insertCandidate(item.id, item.depth, candidate, index, record)));
    onEvent({ type: "expansion", record });
    progress(true);
  }

  // ── the work queue ────────────────────────────────────────────────────────
  // Shallowest first, first-listed sibling first, so a beam keeps one child of
  // each parent before it keeps a second child of any.
  const queue = [{ id: from, depth: 0, order: 0 }];
  const startedAtDepth = new Map();
  let inFlight = 0;
  const waiting = [];
  const wakeAll = () => waiting.splice(0).forEach((resolve) => resolve());

  function nextItem() {
    queue.sort((a, b) => (a.depth - b.depth) || (a.order - b.order));
    while (queue.length) {
      const item = queue[0];
      if ((startedAtDepth.get(item.depth) || 0) < (beam || Infinity)) {
        queue.shift();
        startedAtDepth.set(item.depth, (startedAtDepth.get(item.depth) || 0) + 1);
        return item;
      }
      queue.shift();
      stats.beamDropped += 1;
    }
    return null;
  }

  async function worker() {
    for (;;) {
      if (internal.signal.aborted) return;
      // Expansions in flight may each still add `width` nodes.
      const budgetOpen = stats.created + inFlight * width < maxNodes;
      const item = budgetOpen ? nextItem() : null;
      if (!item) {
        if (inFlight === 0) {
          wakeAll();
          return;
        }
        await new Promise((resolve) => waiting.push(resolve));
        continue;
      }
      inFlight += 1;
      try {
        await expand(item);
      } catch (failure) {
        live.delete(item.id);
        if (!internal.signal.aborted) {
          error = failure;
          internal.abort();
        }
      }
      inFlight -= 1;
      wakeAll();
    }
  }

  progress(true);
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (signal) signal.removeEventListener("abort", onUserStop);
  stats.stopped = !!(signal && signal.aborted);
  stats.elapsedMs = Date.now() - started;
  const inDegree = new Map();
  graph.edges.forEach((e) => inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1));
  stats.convergent = [...inDegree.values()].filter((n) => n > 1).length;
  progress(true);
  return { graph, stats, validation: Engine.validateGraph(graph), trace, error };
}

module.exports = {
  growGraph, proposeAlternatives, parseAlternatives, exprOf, storySoFar, expansionRequest,
  plannedExpansions, mergeMode, DEFAULTS, MERGE_MODES, NEAR_FACTS, TOKENS_PER_ALTERNATIVE,
};
