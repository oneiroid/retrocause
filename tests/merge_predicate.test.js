const test = require('node:test');
const assert = require('node:assert/strict');
const { sameInContext } = require('../merge_predicate');

// Tiny graph builder. nodes: [id, expr, kind?]  edges: [from, to]
function g(nodes, edges) {
  return {
    nodes: nodes.map(([id, expr, kind]) => ({ id, expr, kind: kind || 'story' })),
    edges: edges.map(([from, to]) => ({ id: `${from}_${to}`, from, to, type: 'causes' })),
  };
}

// ── SHOULD MERGE (same in context) ─────────────────────────────────────────

test('a node is the same as itself', () => {
  const graph = g([['x', 'meet(red, wolf)']], []);
  assert.equal(sameInContext(graph, 'x', 'x'), true);
});

test('diamond: same content reached by two parallel paths → merge', () => {
  // root─►x─►m1        m1, m2 carry the same content, neither reaches the
  // root─►y─►m2        other. This is exactly a convergence waiting to form.
  const graph = g(
    [['root', 'start'], ['x', 'a'], ['y', 'b'], ['m1', 'meet(red, wolf)'], ['m2', 'meet(red, wolf)']],
    [['root', 'x'], ['root', 'y'], ['x', 'm1'], ['y', 'm2']],
  );
  assert.equal(sameInContext(graph, 'm1', 'm2'), true);
});

test('two isolated same-content nodes (no edges) → merge', () => {
  const graph = g([['p', 'enter(red, woods)'], ['q', 'enter(red, woods)']], []);
  assert.equal(sameInContext(graph, 'p', 'q'), true);
});

test('content key ignores case and surrounding whitespace', () => {
  const graph = g([['p', 'Meet(red, wolf) '], ['q', 'meet(red, wolf)']], []);
  assert.equal(sameInContext(graph, 'p', 'q'), true);
});

test('kind is provenance, not identity — same content merges across kinds', () => {
  const graph = g([['p', 'meet(red, wolf)', 'branch'], ['q', 'meet(red, wolf)', 'story']], []);
  assert.equal(sameInContext(graph, 'p', 'q'), true);
});

// ── SHOULD NOT MERGE ───────────────────────────────────────────────────────

test('sequential: same content but adjacent in a chain → not the same', () => {
  // a─►b with identical content is recurrence, not identity; merging makes a cycle.
  const graph = g([['a', 'wait(red)'], ['b', 'wait(red)']], [['a', 'b']]);
  assert.equal(sameInContext(graph, 'a', 'b'), false);
});

test('sequential at a distance: same content, one reaches the other → not the same', () => {
  const graph = g(
    [['a', 'wait(red)'], ['c', 'x'], ['d', 'y'], ['b', 'wait(red)']],
    [['a', 'c'], ['c', 'd'], ['d', 'b']],
  );
  assert.equal(sameInContext(graph, 'a', 'b'), false);
});

test('parallel but different content → not the same', () => {
  const graph = g([['root', 'start'], ['p', 'rescue(red)'], ['q', 'eaten(red)']],
    [['root', 'p'], ['root', 'q']]);
  assert.equal(sameInContext(graph, 'p', 'q'), false);
});

test('empty content is never "the same" (don\'t merge unknown states)', () => {
  const graph = g([['p', ''], ['q', '']], []);
  assert.equal(sameInContext(graph, 'p', 'q'), false);
});

test('unknown node id → not the same', () => {
  const graph = g([['p', 'meet(red, wolf)']], []);
  assert.equal(sameInContext(graph, 'p', 'nope'), false);
});

// ── RESOLVED: forward-consistency rejected (2026-07-05) ────────────────────
// The question was: should a divergent future (rescue vs death) reveal a
// hidden difference in the present and BLOCK the merge? Growing a real DAG
// answered no, twice over:
//   1. In the growth loop the candidate is always a childless leaf at merge
//      time — the divergence doesn't exist yet, so a merge-time forward check
//      has nothing to look at. Enforcing it would need post-hoc un-merge.
//   2. A merge whose futures then diverge is exactly a convergence that
//      re-widens — the bottleneck shape the project derives from topology,
//      and the mechanism behind INTUITIONS §5 (non-local influence). Blocking
//      it would suppress the structure the app exists to expose.
// If two same-content states are *genuinely* different in the present, the
// lever is a richer contentKey (already swappable), never the future.
test('same content, diverging futures — still the same state (merge forms a bottleneck)', () => {
  const graph = g(
    [['root', 'start'], ['s1', 'sleep(wolf)'], ['s2', 'sleep(wolf)'], ['rescue', 'rescue(red)'], ['death', 'eaten(red)']],
    [['root', 's1'], ['root', 's2'], ['s1', 'rescue'], ['s2', 'death']],
  );
  assert.equal(sameInContext(graph, 's1', 's2'), true);
});
