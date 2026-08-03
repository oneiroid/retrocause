const test = require('node:test');
const assert = require('node:assert');
const ids = require('../ids.js');
const engine = require('../story_builder_engine.js');
const predicate = require('../merge_predicate.js');

// ── shortHash ───────────────────────────────────────────────────────────────

test('shortHash is stable and content-sensitive', () => {
  assert.equal(ids.shortHash('red_start'), ids.shortHash('red_start'));
  assert.notEqual(ids.shortHash('red_start'), ids.shortHash('red_stark'));
  assert.match(ids.shortHash('anything'), /^[0-9a-f]{16}$/);
});

test('shortHash spreads: no collisions across a few thousand realistic keys', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) {
    seen.add(ids.shortHash(`n_${i}|event(step_${i})|Step ${i}`));
  }
  assert.equal(seen.size, 5000);
});

// ── the single content key ──────────────────────────────────────────────────

test('normalizedContent trims, collapses whitespace and lowercases', () => {
  assert.equal(ids.normalizedContent('  Meets   the\tWolf '), 'meets the wolf');
  assert.equal(ids.normalizedContent(undefined), '');
  assert.equal(ids.normalizedContent(null), '');
});

// The id hash and the merge decision must read the same string, or the graph
// can merge two nodes that hashed differently. One definition, two consumers.
test('merge predicate content key IS the id content key', () => {
  const node = { expr: '  Meets   The Wolf ' };
  assert.equal(predicate.defaultContentKey(node), ids.normalizedContent(node.expr));
});

// ── nodeId ──────────────────────────────────────────────────────────────────

test('nodeId is a function of parent, content and label — not of time', () => {
  const parts = { parentId: 'red_start', expr: 'event(meets_wolf)', label: 'Meets the wolf' };
  assert.equal(ids.nodeId(parts), ids.nodeId(parts));
  assert.notEqual(ids.nodeId(parts), ids.nodeId({ ...parts, parentId: 'red_woods' }));
  assert.notEqual(ids.nodeId(parts), ids.nodeId({ ...parts, expr: 'event(avoids_wolf)' }));
  assert.notEqual(ids.nodeId(parts), ids.nodeId({ ...parts, label: 'Avoids the wolf' }));
});

test('nodeId ignores case and whitespace in expr and label', () => {
  const a = ids.nodeId({ parentId: 'p', expr: 'event(x)', label: 'A Label' });
  const b = ids.nodeId({ parentId: 'p', expr: '  EVENT(x) ', label: 'a   label' });
  assert.equal(a, b);
});

test('collisions get a deterministic suffix, never a fresh random draw', () => {
  const parts = { parentId: 'p', expr: 'event(x)', label: 'x' };
  const first = ids.nodeId(parts);
  const second = ids.nodeId(parts, new Set([first]));
  const third = ids.nodeId(parts, new Set([first, second]));
  assert.equal(second, `${first}_2`);
  assert.equal(third, `${first}_3`);
  // and it is repeatable
  assert.equal(ids.nodeId(parts, new Set([first])), second);
});

test('nodeId accepts a graph as the taken-id source', () => {
  const parts = { parentId: 'p', expr: 'event(x)', label: 'x' };
  const bare = ids.nodeId(parts);
  const graph = { nodes: [{ id: bare }], edges: [] };
  assert.equal(ids.nodeId(parts, graph), `${bare}_2`);
});

// ── edgeId ──────────────────────────────────────────────────────────────────

test('edgeId extends the seeds.js scheme and disambiguates parallel edges', () => {
  assert.equal(ids.edgeId({ from: 'a', to: 'b', type: 'causes' }), 'e_a_b_causes');
  const taken = new Set(['e_a_b_causes']);
  assert.equal(ids.edgeId({ from: 'a', to: 'b', type: 'causes' }, taken), 'e_a_b_causes_2');
});

// ── canonicalJson ───────────────────────────────────────────────────────────

function shuffledPair() {
  const a = {
    root: 'a',
    meta: { title: 'T', version: 2, savedAt: '2026-01-01T00:00:00Z' },
    nodes: [
      { id: 'b', label: 'B', expr: 'event(b)' },
      { id: 'a', label: 'A', expr: 'event(a)' }
    ],
    edges: [{ id: 'e_a_b_causes', from: 'a', to: 'b', type: 'causes' }]
  };
  const b = {
    meta: { version: 2, savedAt: '2029-12-31T23:59:59Z', title: 'T' },
    edges: [{ type: 'causes', to: 'b', from: 'a', id: 'e_a_b_causes' }],
    nodes: [
      { expr: 'event(a)', label: 'A', id: 'a' },
      { expr: 'event(b)', label: 'B', id: 'b' }
    ],
    root: 'a'
  };
  return [a, b];
}

test('canonicalJson is byte-identical for graphs differing only in ordering and savedAt', () => {
  const [a, b] = shuffledPair();
  assert.equal(ids.canonicalJson(a), ids.canonicalJson(b));
});

test('canonicalJson omits savedAt entirely', () => {
  const [a] = shuffledPair();
  assert.ok(!ids.canonicalJson(a).includes('savedAt'));
});

test('canonicalJson emits declared keys first, then unknown keys sorted', () => {
  const graph = {
    root: 'a',
    nodes: [{ zeta: 1, expr: 'event(a)', alpha: 2, id: 'a', label: 'A' }],
    edges: []
  };
  const node = ids.canonicalGraph(graph).nodes[0];
  assert.deepEqual(Object.keys(node), ['id', 'label', 'expr', 'alpha', 'zeta']);
});

// Canonicalization is a reordering, not a filter. Dropping an unknown field
// would make a diff of two canonical forms stop being a diff of two graphs.
test('canonicalJson never drops data', () => {
  const graph = {
    root: 'a',
    custom: 'kept',
    nodes: [{ id: 'a', label: 'A', mystery: { deep: true } }],
    edges: [{ id: 'e', from: 'a', to: 'a', weird: 7 }]
  };
  const back = JSON.parse(ids.canonicalJson(graph));
  assert.equal(back.custom, 'kept');
  assert.deepEqual(back.nodes[0].mystery, { deep: true });
  assert.equal(back.edges[0].weird, 7);
});

// ── the point of all of it: two identical runs produce identical bytes ──────

test('two identical build sequences export byte-identical JSON', () => {
  function build() {
    const graph = engine.normalizeGraph({
      root: 'start',
      nodes: [{ id: 'start', label: 'Start', expr: 'event(start)' }],
      edges: []
    });
    engine.addBranch(graph, 'start', { label: 'Alt', expr: 'event(alt)' });
    return engine.exportGraph(graph);
  }
  assert.equal(build(), build());
});

test('addBranch mints a content-addressed id, and it round-trips through import', () => {
  const graph = engine.normalizeGraph({
    root: 'start',
    nodes: [{ id: 'start', label: 'Start', expr: 'event(start)' }],
    edges: []
  });
  const result = engine.addBranch(graph, 'start', { label: 'Alt', expr: 'event(alt)' });
  assert.ok(result.ok);
  assert.equal(
    result.node.id,
    ids.nodeId({ parentId: 'start', expr: 'event(alt)', label: 'Alt' })
  );
  const restored = engine.importGraph(engine.exportGraph(graph));
  assert.equal(engine.exportGraph(restored), engine.exportGraph(graph));
});
