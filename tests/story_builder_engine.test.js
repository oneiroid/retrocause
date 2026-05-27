const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../story_builder_engine');

function sampleGraph() {
  return engine.normalizeGraph({
    root: 'start',
    meta: { title: 'Test Story', version: 2 },
    nodes: [
      { id: 'start', label: 'Start', expr: 'start(story)', kind: 'root' },
      { id: 'middle', label: 'Middle', expr: 'change(story)', kind: 'canonical' },
      { id: 'end', label: 'End', expr: 'finish(story)', kind: 'convergence' }
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'middle', type: 'causes' },
      { id: 'e2', from: 'middle', to: 'end', type: 'causes' }
    ]
  });
}

test('adds branch with rejoin and keeps graph acyclic', () => {
  const graph = sampleGraph();
  const result = engine.addBranch(graph, 'middle', {
    id: 'branch_help',
    label: 'Ask for help',
    expr: 'ask_help(hero, ally)',
    state: 'An ally enters the causal chain.',
    delta: 'Help is requested.',
    invariants: 'The original goal remains.'
  }, 'end');

  assert.equal(result.ok, true);
  assert.equal(graph.nodes.some((node) => node.id === 'branch_help' && node.kind === 'branch'), true);
  assert.equal(graph.edges.some((edge) => edge.from === 'branch_help' && edge.to === 'end' && edge.type === 'rejoins'), true);
  assert.deepEqual(engine.validateGraph(graph).errors, []);
});

test('rejects cyclic edges', () => {
  const graph = sampleGraph();
  const result = engine.addEdge(graph, { from: 'end', to: 'start', type: 'causes' });
  assert.equal(result.ok, false);
  assert.match(result.message, /cycle/i);
});

test('exports and restores graph JSON', () => {
  const graph = sampleGraph();
  engine.addBranch(graph, 'start', { id: 'branch_truth', label: 'Tell the truth' }, 'end');
  const json = engine.exportGraph(graph);
  const restored = engine.importGraph(json);

  assert.equal(restored.nodes.length, graph.nodes.length);
  assert.equal(restored.edges.length, graph.edges.length);
  assert.equal(restored.nodes.find((node) => node.id === 'branch_truth').label, 'Tell the truth');
  assert.equal(engine.validateGraph(restored).ok, true);
});
