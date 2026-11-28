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
//
// Flagged against INTUITIONS §5 (2026-11-26): if a state is defined by its
// possible futures, as the thesis and Propp's functions suggest, this rule looks
// the wrong way. The disagreement is kept as data; the proposed test is to sample
// futures from each candidate rather than read them from the graph.
//
// Since 2026-11-28 the grower does not use this predicate by default: it merges
// on folded world state (facts.js) and asks a near match about the future
// (judges.js, createFutureJudge). This rule still serves manual inserts, and
// mergeProposals still serves the grower's `routes` mode.

(function attachMergePredicate(root) {
  const Engine = (typeof require !== "undefined")
    ? require("./story_builder_engine.js")
    : root.StoryDagEngine;
  const Ids = (typeof require !== "undefined")
    ? require("./ids.js")
    : root.StoryDagIds;

  // Default reading of "what is true / what happens here": the node's `expr`,
  // normalized for case and whitespace. Swappable so the caller can supply a
  // richer key later without touching the predicate.
  //
  // The normalization itself lives in ids.js because the SAME string feeds
  // the content-addressed node id. Two copies that drifted apart would mean
  // nodes that merge but hash differently.
  function defaultContentKey(node) {
    return Ids.normalizedContent(node.expr);
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

  // ── Proposals for the model's judge ─────────────────────────────────────────
  //
  // A chat model rarely writes the same sentence for the same event twice, so
  // the surface key alone almost never fires on what it grows. Instead, the nodes
  // worth asking the judge about: their last event looks like this one, by shared
  // words in the label, and their states are not strangers. Every proposal costs
  // a model call that stalls running generations, so this errs toward missing a
  // merge.

  // Shared-word share (Jaccard) at which a pair is worth one judge call. States
  // repeat carried-over facts, so their bar is low: over 195 judged pairs, 0.2
  // dropped a quarter of the calls and none of the 23 confirmed merges. Label bar:
  // over 674 judged pairs, 0.5 to 0.6 held 250 calls and 10 merges, most of them
  // false ("The boy thanks the villagers" into "The boy apologizes to the villagers").
  const PROPOSAL_MIN_SIMILARITY = 0.6;
  const PROPOSAL_MIN_STATE_SIMILARITY = 0.2;
  const PROPOSAL_LIMIT = 8;
  const STOPWORDS = new Set(("a an and are as at be but by for from has have her his in into is it its of on or "
    + "she he that the their them they this to was were who with").split(" "));

  function wordsOf(value) {
    const text = String(value || "").toLowerCase();
    return new Set(text.split(/[^a-z0-9']+/).filter((w) => w.length > 1 && !STOPWORDS.has(w)));
  }

  function similarity(a, b) {
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((w) => { if (b.has(w)) shared += 1; });
    return shared / (a.size + b.size - shared);
  }

  // Survivors for `node`, drawn from `from`, most similar first. `from` and its
  // ancestors are out: an edge into them is a cycle. The target's own children
  // and descendants stay in, since a fresh node is comparable to neither.
  function mergeProposals(graph, from, node) {
    const ancestors = new Set([from]);
    for (let frontier = [from]; frontier.length;) {
      const next = [];
      graph.edges.forEach((e) => {
        if (frontier.includes(e.to) && !ancestors.has(e.from)) {
          ancestors.add(e.from);
          next.push(e.from);
        }
      });
      frontier = next;
    }
    const key = defaultContentKey(node);
    const words = wordsOf(node.label);
    const stateWords = wordsOf(node.state);
    return graph.nodes
      .filter((other) => !ancestors.has(other.id) && similarity(stateWords, wordsOf(other.state)) >= PROPOSAL_MIN_STATE_SIMILARITY)
      .map((other) => {
        const overlap = similarity(words, wordsOf(other.label));
        return { id: other.id, score: key && key === defaultContentKey(other) ? 1 + overlap : overlap };
      })
      .filter((c) => c.score >= PROPOSAL_MIN_SIMILARITY)
      .sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)))
      .slice(0, PROPOSAL_LIMIT)
      .map((c) => c.id);
  }

  const api = { sameInContext, defaultContentKey, mergeProposals, similarity, wordsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MergePredicate = api;
})(typeof window !== "undefined" ? window : globalThis);
