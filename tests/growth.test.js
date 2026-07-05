const test = require('node:test');
const assert = require('node:assert/strict');
const { insertContinuation, grow, collapseIfSame } = require('../growth');
const Engine = require('../story_builder_engine');

// Tiny graph builder. nodes: [id, expr]  edges: [from, to]
// root defaults to the first node so validateGraph has an anchor.
function g(nodes, edges) {
  return {
    root: nodes[0] && nodes[0][0],
    nodes: nodes.map(([id, expr]) => ({ id, expr, kind: 'story' })),
    edges: edges.map(([from, to]) => ({ id: `${from}_${to}`, from, to, type: 'causes' })),
  };
}

const indegree = (graph, id) => graph.edges.filter((e) => e.to === id).length;

// ── MERGE FORMS A CONVERGENCE ───────────────────────────────────────────────

test('two parallel continuations with the same content converge', () => {
  // root─►x        continuations from x and y both reach the same content,
  // root─►y        so the second collapses into the first → a diamond.
  const graph = g([['root', 'start'], ['x', 'a'], ['y', 'b']],
    [['root', 'x'], ['root', 'y']]);

  const first = insertContinuation(graph, { from: 'x', node: { id: 'g1', expr: 'arrive(red, grandmother_house)' } });
  const second = insertContinuation(graph, { from: 'y', node: { id: 'g2', expr: 'arrive(red, grandmother_house)' } });

  assert.equal(first.merged, false);
  assert.equal(second.merged, true);
  assert.equal(second.into, 'g1');
  assert.equal(indegree(graph, 'g1'), 2);          // reached from both x and y
  assert.ok(!graph.nodes.some((n) => n.id === 'g2')); // candidate discarded
});

// ── RECURRENCE STAYS SPLIT ──────────────────────────────────────────────────

test('a continuation matching an ancestor is recurrence, not convergence', () => {
  // root─►a(camp).  A later continuation from a that re-reaches "camp" is a
  // look-alike in a changed world: a reaches it, so they are comparable.
  const graph = g([['root', 'start'], ['a', 'camp(red)']], [['root', 'a']]);

  const r = insertContinuation(graph, { from: 'a', node: { id: 'a2', expr: 'camp(red)' } });

  assert.equal(r.merged, false);
  assert.ok(graph.nodes.some((n) => n.id === 'a2'));
});

// ── DIFFERENT CONTENT → NO MERGE ────────────────────────────────────────────

test('parallel continuations with different content are both kept', () => {
  const graph = g([['root', 'start'], ['x', 'a'], ['y', 'b']],
    [['root', 'x'], ['root', 'y']]);

  const p = insertContinuation(graph, { from: 'x', node: { id: 'p', expr: 'rescue(red)' } });
  const q = insertContinuation(graph, { from: 'y', node: { id: 'q', expr: 'eaten(red)' } });

  assert.equal(p.merged, false);
  assert.equal(q.merged, false);
  assert.equal(graph.nodes.filter((n) => n.id === 'p' || n.id === 'q').length, 2);
});

// ── BATCH ORDER ─────────────────────────────────────────────────────────────

test('grow: a later candidate merges into one added earlier in the same call', () => {
  const graph = g([['root', 'start'], ['x', 'a'], ['y', 'b']],
    [['root', 'x'], ['root', 'y']]);

  const results = grow(graph, [
    { from: 'x', node: { id: 'g1', expr: 'arrive(red, grandmother_house)' } },
    { from: 'y', node: { id: 'g2', expr: 'arrive(red, grandmother_house)' } },
  ]);

  assert.equal(results[0].merged, false);
  assert.equal(results[1].merged, true);
  assert.equal(results[1].into, 'g1');
});

// ── INVARIANTS ──────────────────────────────────────────────────────────────

test('the graph stays acyclic and valid after growth', () => {
  const graph = g([['root', 'start'], ['x', 'a'], ['y', 'b']],
    [['root', 'x'], ['root', 'y']]);

  grow(graph, [
    { from: 'x', node: { id: 'g1', expr: 'arrive(red, grandmother_house)' } },
    { from: 'y', node: { id: 'g2', expr: 'arrive(red, grandmother_house)' } },
  ]);

  assert.equal(Engine.validateGraph(graph).ok, true);
});

test('an id generated when the candidate omits one', () => {
  const graph = g([['root', 'start']], []);
  const r = insertContinuation(graph, { from: 'root', node: { expr: 'enter(red, woods)' } });
  assert.equal(r.merged, false);
  assert.ok(r.node.id, 'expected a generated id');
});

// ── COLLAPSE AFTER ARBITRARY INSERTS (UI path) ─────────────────────────────
// The UI's branch form can attach edges in BOTH directions (choice in, rejoin
// out) before any merge check runs. collapseIfSame must rewire all of them.

test('collapseIfSame rewires both incoming and outgoing edges to the survivor', () => {
  // Existing: root─►x─►goal, plus survivor s (arrive) reached from x.
  // Victim v duplicates s's content, hangs off root, and rejoins goal.
  const graph = g(
    [['root', 'start'], ['x', 'a'], ['s', 'arrive(red, grandmother_house)'], ['goal', 'end']],
    [['root', 'x'], ['x', 's'], ['x', 'goal']],
  );
  graph.nodes.push({ id: 'v', expr: 'arrive(red, grandmother_house)', kind: 'branch' });
  graph.edges.push({ id: 'root_v', from: 'root', to: 'v', type: 'choice' });
  graph.edges.push({ id: 'v_goal', from: 'v', to: 'goal', type: 'rejoins' });

  const r = collapseIfSame(graph, 'v');

  assert.equal(r.merged, true);
  assert.equal(r.into, 's');
  assert.ok(!graph.nodes.some((n) => n.id === 'v'));
  assert.ok(graph.edges.some((e) => e.from === 'root' && e.to === 's'), 'incoming rewired');
  assert.ok(graph.edges.some((e) => e.from === 's' && e.to === 'goal'), 'outgoing rewired');
  assert.equal(Engine.validateGraph(graph).ok, true);
});

test('collapseIfSame does not duplicate an edge the survivor already has', () => {
  // Victim's parent already points at the survivor → rewire must be skipped.
  const graph = g(
    [['root', 'start'], ['s', 'arrive(red, grandmother_house)']],
    [['root', 's']],
  );
  graph.nodes.push({ id: 'v', expr: 'arrive(red, grandmother_house)', kind: 'story' });
  graph.edges.push({ id: 'root_v', from: 'root', to: 'v', type: 'causes' });

  const r = collapseIfSame(graph, 'v');

  assert.equal(r.merged, true);
  assert.equal(graph.edges.filter((e) => e.from === 'root' && e.to === 's').length, 1);
});

test('collapseIfSame is a no-op when nothing matches', () => {
  const graph = g([['root', 'start'], ['u', 'unique(thing)']], [['root', 'u']]);
  const before = JSON.stringify(graph);
  const r = collapseIfSame(graph, 'u');
  assert.equal(r.merged, false);
  assert.equal(JSON.stringify(graph), before);
});

// ── BAD INPUT ───────────────────────────────────────────────────────────────

test('a missing source node is rejected and leaves the graph unchanged', () => {
  const graph = g([['root', 'start']], []);
  const before = graph.nodes.length;
  const r = insertContinuation(graph, { from: 'nope', node: { id: 'n', expr: 'x' } });

  assert.equal(r.ok, false);
  assert.equal(graph.nodes.length, before);
});
