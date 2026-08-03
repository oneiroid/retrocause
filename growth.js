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
  const Ids = (typeof require !== "undefined")
    ? require("./ids.js")
    : root.StoryDagIds;

  // If `nodeId` is the same state in context as an existing node, collapse it:
  // remove it and rewire ALL its edges (incoming and outgoing) to the survivor,
  // skipping rewires the survivor already has. Safe for the same reason the
  // simple merge is: a rewired edge could only cycle if its far endpoint were
  // reachable from / could reach the survivor through the victim — which would
  // have made victim and survivor comparable and blocked the merge.
  // Returns { merged:true, into } or { merged:false }.
  function collapseIfSame(graph, nodeId) {
    const survivor = graph.nodes.find(
      (other) => other.id !== nodeId && Predicate.sameInContext(graph, nodeId, other.id),
    );
    if (!survivor) return { merged: false };

    const touched = graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);
    graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    touched.forEach((e) => {
      const { id, from: oldFrom, to: oldTo, ...rest } = e;
      const from = oldFrom === nodeId ? survivor.id : oldFrom;
      const to = oldTo === nodeId ? survivor.id : oldTo;
      const duplicate = graph.edges.some((other) => other.from === from && other.to === to);
      if (!duplicate) Engine.addEdge(graph, { ...rest, from, to });
    });
    return { merged: true, into: survivor.id };
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
    // Content-addressed, hashing the node `from` was reached under. This is
    // the id site that fires most — once per inserted continuation — so it is
    // the one that decides whether a grown graph replays at all (§3).
    if (!node.id) node.id = Ids.nodeId({ parentId: from, expr: node.expr, label: node.label }, graph);

    graph.nodes.push(node);
    const result = Engine.addEdge(graph, { from, to: node.id, type, label });
    if (!result.ok) {
      graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
      return result;
    }
    const edge = graph.edges[graph.edges.length - 1];

    const collapsed = collapseIfSame(graph, node.id);
    if (!collapsed.merged) return { merged: false, node, edge };
    return { merged: true, into: collapsed.into, edge: graph.edges[graph.edges.length - 1] };
  }

  // Apply several continuations in order. Order is significant: a later
  // candidate can merge into a node added earlier in the same call.
  function grow(graph, continuations) {
    return (continuations || []).map((c) => insertContinuation(graph, c));
  }

  const api = { insertContinuation, grow, collapseIfSame };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagGrowth = api;
})(typeof window !== "undefined" ? window : globalThis);
