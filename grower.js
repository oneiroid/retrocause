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
const { createJudge, createCritic } = require("./judges.js");

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

const DEFAULTS = {
  depth: 4, width: 3, beam: 8, maxNodes: 60, merge: true, prune: false, temperature: DEFAULT_TEMPERATURE,
};

// The story so far as the model reads it. The path comes first and the request
// last, so siblings and cousins share an evaluated prefix on the server.
function storySoFar(graph, sourceId) {
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
    `World state now: ${(path.at(-1) || {}).state || "(not stated)"}`,
  ].join("\n");
}

function expansionRequest(graph, source, width, template) {
  const story = storySoFar(graph, source.id);
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

// The alternatives in a completion: `event | state`, or `event | state | end`.
// A non-empty line without both fields is a fragment (the tail of a length stop,
// say), counted as malformed by the caller.
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
    alternatives.push({ label, expr: exprOf(label), state, ending: END_MARK.test(mark || "") });
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
async function proposeAlternatives({ graph, source, width, temperature, client, template, signal, onToken }) {
  const request = expansionRequest(graph, source, width, template);
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

  const stats = {
    created: 0,
    merged: 0,
    mergesRefused: 0,
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

  const judge = merge ? createJudge({ client, system: templates.same, signal: internal.signal }) : null;
  const critic = prune ? createCritic({ client, system: templates.critic, signal: internal.signal }) : null;

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

  async function insertCandidate(sourceId, itemDepth, candidate, index, record) {
    if (stats.created >= maxNodes) return;
    const source = graph.nodes.find((n) => n.id === sourceId);
    const node = {
      label: candidate.label,
      kind: "branch",
      expr: candidate.expr,
      state: candidate.state,
      tags: candidate.ending ? ["counterfactual", "ending"] : ["counterfactual"],
      createdBy: "grown",
      ...(runId ? { runId } : {}),
    };
    if (Growth.isNullTransition(source, node)) {
      stats.nullTransitions += 1;
      return;
    }
    if (tellsNext(sourceId, node.expr)) stats.toldNext += 1;

    // Everything from `mergeProposals` to the insert below runs without an
    // await, so no node can slip in between "nothing left to ask" and the insert.
    const asked = new Set();
    for (;;) {
      if (!judge) break;
      const open = Predicate.mergeProposals(graph, sourceId, node).filter((id) => !asked.has(id));
      if (!open.length || asked.size >= MAX_JUDGED_PER_CANDIDATE) break;
      const batch = open.slice(0, MAX_JUDGED_PER_CANDIDATE - asked.size);
      batch.forEach((id) => asked.add(id));
      const verdicts = await Promise.all(batch.map((id) => judge(graph, id, sourceId, node)));
      let same = null;
      verdicts.forEach((verdict, i) => {
        record.judgements.push({ label: node.label, survivor: batch[i], ...verdict });
        if (verdict.same && (!same || verdict.pYes > same.verdict.pYes)) same = { id: batch[i], verdict };
        if (!verdict.same) stats.mergesRefused += 1;
      });
      if (same) {
        const label = `same point, P=${same.verdict.pYes.toFixed(2)}`;
        const edge = Growth.rejoin(graph, { from: sourceId, into: same.id, label });
        stats.merged += 1;
        onEvent({ type: "merge", from: sourceId, into: same.id, edge, label: node.label, pYes: same.verdict.pYes });
        return;
      }
      if (stats.created >= maxNodes) return;
    }

    const { node: created, edge } = Growth.attach(graph, { from: sourceId, node, type: "choice" });
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
    const proposal = await proposeAlternatives({
      graph, source, width, temperature, client, template: templates.branch, signal: internal.signal,
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
  progress(true);
  return { graph, stats, validation: Engine.validateGraph(graph), trace, error };
}

module.exports = {
  growGraph, proposeAlternatives, parseAlternatives, exprOf, storySoFar, expansionRequest,
  plannedExpansions, DEFAULTS, TOKENS_PER_ALTERNATIVE,
};
