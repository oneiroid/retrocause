// Merge predicate: "is node A the same state as node B, in the context of
// the existing DAG?" Used when growing the graph — when a freshly generated
// continuation turns out to already exist, the two are merged so the graph
// converges instead of exploding.
//
// v0 rule (deliberately minimal — no fact-lexicon, no scoring):
//
//   same(A, B)  ⟺  A ≠ B
//                 ∧ contentKey(A) == contentKey(B)   (same, non-empty content)
//                 ∧ A and B are INCOMPARABLE          (neither reaches the other)
//
// The incomparability clause is the whole "in context" idea:
//   - same content reached by two *parallel* paths  → the same state → MERGE
//     (this is what produces a genuine convergence node)
//   - same content where one path *leads to* the other → recurrence, a later
//     look-alike in a changed world → NOT the same, and merging would make a
//     cycle anyway.
//
// Forward-consistency (should a divergent future block the merge?) was probed
// on a real grown DAG and REJECTED (2026-07-05): at merge time the candidate
// is a childless leaf, so the future isn't there to consult; and a merge whose
// futures later diverge is precisely a bottleneck — the structure the app
// exists to expose (INTUITIONS §5). If two same-content states really differ
// in the present, express that in a richer contentKey; never consult the
// future. See the resolved case in tests/merge_predicate.test.js.

(function attachMergePredicate(root) {
  const Engine = (typeof require !== "undefined")
    ? require("./story_builder_engine.js")
    : root.StoryDagEngine;

  // Default reading of "what is true / what happens here": the node's `expr`,
  // normalized for case and whitespace. Swappable so the caller can supply a
  // richer key later without touching the predicate.
  function defaultContentKey(node) {
    return String(node.expr || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function sameInContext(graph, aId, bId, contentKey = defaultContentKey) {
    if (aId === bId) return true;
    const a = graph.nodes.find((n) => n.id === aId);
    const b = graph.nodes.find((n) => n.id === bId);
    if (!a || !b) return false;
    const ka = contentKey(a);
    if (!ka || ka !== contentKey(b)) return false;          // same, non-empty content
    if (Engine.reachable(graph, aId, bId) || Engine.reachable(graph, bId, aId)) return false; // parallel only
    return true;
  }

  const api = { sameInContext, defaultContentKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MergePredicate = api;
})(typeof window !== "undefined" ? window : globalThis);
