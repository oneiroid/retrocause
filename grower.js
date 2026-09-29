// The deterministic traversal (LOCAL_LLM.md §5.5). Proposes continuations via
// llm_client, inserts via growth.js, returns { graph, stats, validation }.
//
// Node-only, like llm_client.js: it drives HTTP, so it is never added to the
// page. The page consumes its OUTPUT — a grown graph file — through the
// existing import path (§5.6).
//
// Division of labor: grower.js decides WHAT to propose and in WHAT ORDER;
// growth.js decides whether each proposal is a new state or an existing one.
// The grower does NO deduplication of its own — a second dedup pass with a
// different key would be a silent second definition of "same state" (§5.5.4).
//
// Every ordering decision is pinned, because an unordered iteration is as
// fatal to replay as a random seed:
//   - expansion order: topoRanks, then id, lexicographic (§5.5.1)
//   - candidate order: normalized expr, then label — never the model's
//     output order (§5.5.3)
//   - insertion order is therefore pinned, which is what makes the
//     order-dependent ids of merged survivors deterministic (§3.1)

"use strict";

const Engine = require("./story_builder_engine.js");
const Growth = require("./growth.js");
const Ids = require("./ids.js");

// ── branch.v4: a document the base model continues by one line ─────────────
//
// v1–v3 (removed 2026-09-29) were instructions ("List the alternatives…")
// sent to a BASE model, which has no instruction tuning to read them with,
// and they asked for alternatives outright. v4 asks for nothing. The prompt
// is a `head`-style dump of story files in JSON Lines — one complete story,
// then the current story's path up to the source node — and the completion is
// the next line of that file. Branching comes from sampling that one line
// several times (`width` draws per expansion, each with a derived seed), not
// from asking the model to differ from the told story; a draw that repeats
// the told next event is merged by growth.js like any other duplicate.
//
// The told story's future is deliberately NOT shown: in a document a base
// model continues, a visible future is something to copy. So v4 has no
// `rejoin`, and no `delta`/`invariants` — those are relative to the told
// story, and the line format has nowhere natural to put them. Rejoins
// arrive only through merge: a draw whose content equals an existing state
// on a parallel path collapses into it. `actor` is
// gone too: seed nodes carry none, and a key present on the generated line
// but absent from every line above it is not a continuation of the file.
//
// The grammar pins the line's shape rather than the prompt asking for it:
// the step number is a literal, text fields cannot contain a quote, backslash
// or control character (so the line is valid JSON by construction and cannot
// run onto a second line), and `action` must be `verb(arg, …)` in the seeds'
// lowercase snake_case.
const JSONL_STRING_CHAR = String.raw`[^"\\\x7F\x00-\x1F]`;

// One flat JSON object on one line, in the `{"k": v, "k2": [a, b]}` spacing
// Python's json.dumps writes — the common form of a .jsonl file, and the form
// the grammar's literals use.
function jsonLine(object) {
  const value = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]` : JSON.stringify(v));
  return `{${Object.entries(object).map(([k, v]) => `${JSON.stringify(k)}: ${value(v)}`).join(", ")}}`;
}

// The file line for one node. Key order is fixed: it is the order the model
// reads and writes a step in — what happened in prose first, then its
// formal action, then what is true afterwards.
function stepLine(step, node) {
  return jsonLine({ step, event: node.label || node.expr || "", action: node.expr || "", state: node.state || "" });
}

function storyFileName(title) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${slug || "story"}.jsonl`;
}

function nextStepGrammar(graph, source) {
  const step = ancestorPath(graph, source.id).length + 1;
  const open = JSON.stringify(`{"step": ${step}, "event": "`);
  return [
    `root ::= ${open} text ${JSON.stringify('", "action": "')} action ${JSON.stringify('", "state": "')} text ${JSON.stringify('"}')}`,
    `text ::= ${JSONL_STRING_CHAR}+`,
    `action ::= word "(" word (", " word)* ")"`,
    `word ::= [a-z] [a-z0-9_]*`,
  ].join("\n");
}

function parseNextStep(content) {
  const line = JSON.parse(content);
  return [{ label: line.event, expr: line.action, state: line.state }];
}

// Prompt version → how its requests are constrained (`constrain(graph,
// source)` → { schema } or { grammar }), how a completion becomes candidates,
// and how many completions one expansion draws. v4 is the only version; the
// indirection stays because the eval baseline is a second format.
const PROMPT_FORMATS = {
  "branch.v4": {
    constrain: (graph, source) => ({ grammar: nextStepGrammar(graph, source) }),
    parse: parseNextStep,
    draws: (width) => width,
  },
};
const DEFAULT_PROMPT_VERSION = "branch.v4";

function formatForPrompt(version) {
  const format = PROMPT_FORMATS[version];
  if (!format) throw new Error(`no format registered for prompt ${version}`);
  return format;
}

// Per-draw seeds are derived, not drawn: (client seed, source, index) must
// give the same integer on a rerun or the run does not replay. The callers
// grow under llm_client's SAMPLED_SAMPLING; under the greedy reference
// profile every draw would return the same line and merge into the first.
function drawSeed(clientSeed, sourceId, index) {
  return parseInt(Ids.shortHash(`${clientSeed}|${sourceId}|${index}`).slice(0, 8), 16);
}

// Deterministic template rendering: pure string substitution of the graph
// context below. The rendered prompt is a cache key (§5.7), so nothing
// non-deterministic may enter it.
function renderPrompt(template, context = {}) {
  return String(template)
    .replaceAll("{{file}}", context.file || "")
    .replaceAll("{{header}}", context.header || "")
    .replaceAll("{{steps}}", context.steps || "");
}

// ── prompt context ──────────────────────────────────────────────────────────
//
// Everything the model is told about the graph is derived here, and every
// ordering in it is pinned for the same reason the traversal's orderings are:
// the rendered prompt IS the cache key, so a context that reordered between
// runs would be a different prompt for the same state and replay would fail.

// The lexicographically-first shortest path from the graph's root to `to`.
// A node in a DAG can be reached several ways, and "whichever path we found"
// is not a pinned choice — two runs that picked differently would render
// different prompts for the same node.
function ancestorPath(graph, to) {
  const from = graph.root;
  if (!from || from === to) return [to];

  // Distance to the target over REVERSED edges, so the forward walk can tell
  // which successors still lead there without a second search per step.
  const distance = { [to]: 0 };
  for (let queue = [to]; queue.length;) {
    const next = [];
    for (const id of queue) {
      for (const edge of graph.edges) {
        if (edge.to !== id || distance[edge.from] !== undefined) continue;
        distance[edge.from] = distance[id] + 1;
        next.push(edge.from);
      }
    }
    queue = next;
  }
  // An unreachable node still gets a prompt; it just has no story behind it.
  if (distance[from] === undefined) return [to];

  const path = [from];
  for (let cur = from; cur !== to;) {
    // distance[cur] > 0 guarantees such a step exists: that is how BFS
    // assigned it. Ties broken by id, the same rule orderFrontier uses.
    const [step] = graph.edges
      .filter((e) => e.from === cur && distance[e.to] === distance[cur] - 1)
      .map((e) => e.to)
      .sort((a, b) => String(a).localeCompare(String(b)));
    path.push(step);
    cur = step;
  }
  return path;
}

// Computed at expansion time, which is a pinned point in a pinned order: the
// path reflects the graph as the traversal has left it.
function promptContext(graph, node) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const title = graph.title || (graph.meta && graph.meta.title) || "the told story";
  const entities = Array.isArray(graph.entities) ? graph.entities : [];
  const pathNodes = ancestorPath(graph, node.id).map((id) => byId.get(id) || { expr: id });
  return {
    file: storyFileName(title),
    header: jsonLine({ title, ...(entities.length ? { characters: entities } : {}) }),
    steps: pathNodes.map((n, i) => stepLine(i + 1, n)).join("\n"),
  };
}

// §5.5.3 — sort returned branches by a deterministic key before the width
// cap. The model's output order is not trusted to be stable.
function byCandidateKey(a, b) {
  const ea = Ids.normalizedContent(a.expr);
  const eb = Ids.normalizedContent(b.expr);
  if (ea !== eb) return ea.localeCompare(eb);
  return Ids.normalizedContent(a.label).localeCompare(Ids.normalizedContent(b.label));
}

// §5.5.1 — expansion points sorted by topological rank, then id. Computed
// per round: earlier inserts in the same round can change ranks, and the
// pinned rule is "ranks as of the round start".
function orderFrontier(graph, ids) {
  const ranks = Engine.topoRanks(graph);
  return [...ids].sort((a, b) => (ranks[a] - ranks[b]) || String(a).localeCompare(String(b)));
}

// Grow `graph` from `from` for up to `depth` rounds, at most `width` accepted
// branches per expansion point, stopping once `maxNodes` nodes were created.
//
// Counts everything it declines to do — rejections are manifest data, never
// silently swallowed (§5.5.5).
async function growGraph({
  graph: inputGraph,
  client,
  promptTemplate,
  // How requests are constrained and completions read — formatForPrompt(v).
  format = PROMPT_FORMATS[DEFAULT_PROMPT_VERSION],
  from,
  depth,
  width,
  maxNodes,
  runId = null,
  bypassCache = false,
} = {}) {
  // normalizeGraph clones and resolves defaults, so ids downstream hash the
  // fields nodes actually end up with — and the grower never mutates its input.
  const graph = Engine.normalizeGraph(inputGraph);
  if (!graph.nodes.some((n) => n.id === from)) {
    throw new Error(`traversal.from node not in graph: ${from}`);
  }

  const stats = {
    created: 0,
    mergedDuplicates: 0,
    rejectedCycles: 0,
    rejectedNullTransitions: 0,
    truncated: 0,
    expansions: 0,
  };
  const clientSeed = client.sampling && client.sampling.seed;
  // Every request as sent and every completion as received, per expansion —
  // what the Lab shows as "the prompts". Not part of the graph or the stats,
  // so it cannot move a canonical-JSON comparison.
  const trace = [];

  let frontier = [from];
  for (let round = 1; round <= depth && frontier.length && stats.created < maxNodes; round += 1) {
    const next = new Set();
    for (const sourceId of orderFrontier(graph, frontier)) {
      if (stats.created >= maxNodes) break;
      const source = graph.nodes.find((n) => n.id === sourceId);
      const prompt = renderPrompt(promptTemplate, promptContext(graph, source));
      const { schema, grammar } = format.constrain(graph, source);
      const draws = format.draws ? format.draws(width) : 1;

      const proposed = [];
      const expansion = { from: sourceId, prompt, ...(grammar ? { grammar } : {}), ...(schema ? { schema } : {}), draws: [] };
      trace.push(expansion);
      let answered = false;
      for (let index = 0; index < draws; index += 1) {
        const seed = draws > 1 ? drawSeed(clientSeed, sourceId, index) : clientSeed;
        try {
          const { content } = await client.complete(prompt, schema, {
            bypassCache, grammar,
            ...(draws > 1 ? { seed } : {}),
          });
          expansion.draws.push({ seed, content });
          proposed.push(...format.parse(content));
          answered = true;
        } catch (error) {
          // Truncation is a counted hard failure for this draw, not a retry
          // with a bigger cap — that would make the run irreproducible
          // (§5.3). Anything else is a real error and stops the run.
          if (!error.truncated) throw error;
          expansion.draws.push({ seed, content: error.content || "", truncated: true });
          stats.truncated += 1;
        }
      }
      if (!answered) continue;
      stats.expansions += 1;

      for (const candidate of proposed.sort(byCandidateKey).slice(0, width)) {
        if (stats.created >= maxNodes) break;
        const node = {
          // The engine would later default an empty label to the node id —
          // but the id hashes the label, so resolve the fallback BEFORE the
          // id is minted, not after (§3.1 "pass the RESOLVED fields").
          label: candidate.label || candidate.expr,
          kind: "branch",
          expr: candidate.expr,
          state: candidate.state,
          tags: ["counterfactual"],
          createdBy: "grown",
          ...(runId ? { runId } : {}),
        };

        const result = Growth.insertContinuation(graph, {
          from: sourceId,
          node,
          type: "choice",
          label: "",
        });
        if (result.ok === false) {
          // Two distinct refusals, counted apart: a cycle is a structural
          // impossibility, a null transition is a proposal that said nothing.
          // Collapsing them would hide which failure a run actually had.
          if (result.reason === "null_transition") stats.rejectedNullTransitions += 1;
          else stats.rejectedCycles += 1;
          continue;
        }

        if (result.merged) stats.mergedDuplicates += 1;
        else stats.created += 1;
        next.add(result.merged ? result.into : result.node.id);
      }
    }
    frontier = [...next];
  }

  // Once per run, never per insert (§8) — per-insert cycle refusal is
  // addEdge's own wouldCreateCycle.
  const validation = Engine.validateGraph(graph);
  return { graph, stats, validation, trace };
}

module.exports = {
  growGraph, renderPrompt, promptContext, ancestorPath, formatForPrompt, drawSeed,
  nextStepGrammar, stepLine, storyFileName, DEFAULT_PROMPT_VERSION,
};
