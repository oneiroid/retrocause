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

// The branch payload contract (§5.3) — matches what the app's import path
// already accepts (story_builder_app.js:778-801). Enforced by the sampler as
// a grammar, so "did the output parse" is structural, not probabilistic.
// `rejoinTargetId` cannot be constrained to existing ids by JSON Schema; it
// is validated after the fact and dropped when invalid (§5.5.6).
const BRANCH_SCHEMA = {
  type: "object",
  required: ["branches"],
  properties: {
    branches: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        required: ["label", "expr", "state", "delta", "invariants"],
        properties: {
          label: { type: "string" },
          expr: { type: "string" },
          state: { type: "string" },
          delta: { type: "string" },
          invariants: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          rejoinTargetId: { type: "string" },
        },
      },
    },
  },
};

// Deterministic template rendering: pure string substitution on the node's
// resolved fields plus the graph context below. The rendered prompt is a
// cache key (§5.7), so nothing non-deterministic may enter it.
//
// `context` is optional so `branch.v1.txt` — which has no {{story}} or
// {{path}} — still renders exactly as it did.
function renderPrompt(template, node, context = {}) {
  return String(template)
    .replaceAll("{{label}}", node.label || "")
    .replaceAll("{{expr}}", node.expr || "")
    .replaceAll("{{state}}", node.state || "")
    .replaceAll("{{title}}", context.title || "")
    .replaceAll("{{story}}", context.story || "")
    .replaceAll("{{path}}", context.path || "");
}

// ── prompt context (branch.v2) ──────────────────────────────────────────────
//
// Everything the model is told about the graph is derived here, and every
// ordering in it is pinned for the same reason the traversal's orderings are:
// the rendered prompt IS the cache key, so a context that reordered between
// runs would be a different prompt for the same state and replay would fail.
//
// v1 gave the model one node — no story, no ancestors. The observed failure
// was not drift but contamination: with nothing else to condition on, the
// strongest signal in the window was the few-shot, and by depth 3 the model
// was completing the demonstration instead of the story.

// The told story: every node this run did not grow, in topological order.
// Ids are exposed because `rejoinTargetId` is unusable without them — the
// model cannot name a target it has never been shown, which is why v1
// produced zero rejoins edges despite the schema accepting them.
function storySpine(graph) {
  const ranks = Engine.topoRanks(graph);
  return graph.nodes
    .filter((n) => n.createdBy !== "grown")
    .sort((a, b) => (ranks[a.id] - ranks[b.id]) || String(a.id).localeCompare(String(b.id)))
    .map((n) => `  [${n.id}] ${n.expr}${n.state ? ` — ${n.state}` : ""}`)
    .join("\n");
}

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
// spine is stable across a run (grown nodes are filtered out), while the path
// reflects the graph as the traversal has left it.
function promptContext(graph, node) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return {
    title: graph.title || (graph.meta && graph.meta.title) || "the told story",
    story: storySpine(graph),
    path: ancestorPath(graph, node.id)
      .map((id) => (byId.get(id) || {}).expr || id)
      .join(" → "),
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
    droppedRejoins: 0,
    expansions: 0,
  };

  let frontier = [from];
  for (let round = 1; round <= depth && frontier.length && stats.created < maxNodes; round += 1) {
    const next = new Set();
    for (const sourceId of orderFrontier(graph, frontier)) {
      if (stats.created >= maxNodes) break;
      const source = graph.nodes.find((n) => n.id === sourceId);

      let proposed;
      try {
        const { content } = await client.complete(
          renderPrompt(promptTemplate, source, promptContext(graph, source)),
          BRANCH_SCHEMA,
          { bypassCache },
        );
        proposed = JSON.parse(content).branches;
      } catch (error) {
        // Truncation is a counted hard failure for this expansion point, not
        // a retry with a bigger cap — that would make the run irreproducible
        // (§5.3). Anything else is a real error and stops the run.
        if (!error.truncated) throw error;
        stats.truncated += 1;
        continue;
      }
      stats.expansions += 1;

      for (const candidate of [...proposed].sort(byCandidateKey).slice(0, width)) {
        if (stats.created >= maxNodes) break;
        const node = {
          // The engine would later default an empty label to the node id —
          // but the id hashes the label, so resolve the fallback BEFORE the
          // id is minted, not after (§3.1 "pass the RESOLVED fields").
          label: candidate.label || candidate.expr,
          kind: "branch",
          expr: candidate.expr,
          state: candidate.state,
          delta: candidate.delta,
          invariants: candidate.invariants,
          tags: Array.isArray(candidate.tags) && candidate.tags.length ? candidate.tags : ["counterfactual"],
          createdBy: "grown",
          ...(runId ? { runId } : {}),
        };

        const result = Growth.insertContinuation(graph, {
          from: sourceId,
          node,
          type: "choice",
          label: node.delta || "alternative branch",
        });
        if (result.ok === false) {
          // Two distinct refusals, counted apart: a cycle is a structural
          // impossibility, a null transition is a proposal that said nothing.
          // Collapsing them would hide which failure a run actually had.
          if (result.reason === "null_transition") stats.rejectedNullTransitions += 1;
          else stats.rejectedCycles += 1;
          continue;
        }

        const landedId = result.merged ? result.into : result.node.id;
        if (result.merged) stats.mergedDuplicates += 1;
        else stats.created += 1;
        next.add(landedId);

        // §5.5.6 — a rejoin that names a missing node or would cycle is
        // dropped and counted; the branch node itself stays. An open branch
        // is a legitimate outcome that validateGraph warns about.
        if (candidate.rejoinTargetId) {
          const rejoin = graph.nodes.some((n) => n.id === candidate.rejoinTargetId)
            ? Engine.addEdge(graph, {
              from: landedId,
              to: candidate.rejoinTargetId,
              type: "rejoins",
              label: "rejoins the story",
              branchId: landedId,
            })
            : { ok: false };
          if (!rejoin.ok) stats.droppedRejoins += 1;
        }
      }
    }
    frontier = [...next];
  }

  // Once per run, never per insert (§8) — per-insert cycle refusal is
  // addEdge's own wouldCreateCycle.
  const validation = Engine.validateGraph(graph);
  return { graph, stats, validation };
}

module.exports = { growGraph, renderPrompt, promptContext, ancestorPath, storySpine, BRANCH_SCHEMA };
