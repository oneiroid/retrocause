// Growth loop (v0) — merge-on-insert.
//
// Insert a candidate continuation ("a new state `node` reached from an existing
// node `from`") into the DAG. If the new state turns out to be the same state
// as one already in the graph — same content, reached by a *parallel* path —
// collapse it into that existing node so the graph CONVERGES instead of growing
// a fresh leaf for every continuation.
//
// The whole merge decision is delegated to MergePredicate.sameInContext. The
// rewire on merge (`from → survivor`) is provably acyclic: it could only cycle
// if the survivor already reached `from`, but that is exactly the condition
// that makes the two nodes comparable and blocks the merge. So merge and
// acyclicity are the same condition — no extra cycle guard is needed.
//
// v0 deliberately has no continuation *generator*: candidates are hand-fed by
// tests (and, later, the manual branch form). Grow the Red DAG by hand and look
// at the convergence before building anything that produces continuations.

(function attachGrowth(root) {
  const Engine = (typeof require !== "undefined")
    ? require("./story_builder_engine.js")
    : root.StoryDagEngine;
  const Predicate = (typeof require !== "undefined")
    ? require("./merge_predicate.js")
    : root.MergePredicate;

  function newId() {
    return `grow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // Insert one continuation. Returns:
  //   { merged:true,  into, edge }  — collapsed into an existing parallel state
  //   { merged:false, node, edge }  — kept as a genuinely new state
  //   { ok:false, message }         — bad input (e.g. `from` not in graph)
  function insertContinuation(graph, { from, node, type, label } = {}) {
    if (!graph.nodes.some((n) => n.id === from)) {
      return { ok: false, message: `Source node ${from} is missing` };
    }
    if (!node) return { ok: false, message: "Continuation has no node" };
    if (!node.id) node.id = newId();

    graph.nodes.push(node);
    const result = Engine.addEdge(graph, { from, to: node.id, type, label });
    if (!result.ok) {
      graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
      return result;
    }
    const edge = graph.edges[graph.edges.length - 1];

    const survivor = graph.nodes.find(
      (other) => other.id !== node.id && Predicate.sameInContext(graph, node.id, other.id),
    );
    if (!survivor) return { merged: false, node, edge };

    // Collapse the candidate into the existing state: drop it, rewire the edge.
    graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
    graph.edges = graph.edges.filter((e) => e.id !== edge.id);
    const rewired = Engine.addEdge(graph, { from, to: survivor.id, type, label });
    return { merged: true, into: survivor.id, edge: rewired.ok ? graph.edges[graph.edges.length - 1] : edge };
  }

  // Apply several continuations in order. Order is significant: a later
  // candidate can merge into a node added earlier in the same call.
  function grow(graph, continuations) {
    return (continuations || []).map((c) => insertContinuation(graph, c));
  }

  const api = { insertContinuation, grow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagGrowth = api;
})(typeof window !== "undefined" ? window : globalThis);
