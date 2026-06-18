// Tests for cone.js — FORMAL_MODEL.md §8.3 (possibility cone derived
// from the attractor Ω). Hand-computable answers on the red and magi
// seeds; synthetic graphs for rim / waist / criticality edge cases.

const test = require('node:test');
const assert = require('node:assert/strict');
const cone = require('../cone');
const { seeds } = require('../seeds');
const engine = require('../story_builder_engine');

function clone(graph) { return JSON.parse(JSON.stringify(graph)); }

// --- §8.3.2 support = forward(source) ∩ backward(Ω) -------------------

test('red: every canonical node is in support toward red_rescue', () => {
  const s = cone.support(seeds.red, 'red_rescue');
  for (const node of seeds.red.nodes) assert.equal(s.has(node.id), true, node.id);
});

test('magi: support toward magi_love contains both parallel chains', () => {
  const s = cone.support(seeds.magi, 'magi_love');
  for (const node of seeds.magi.nodes) assert.equal(s.has(node.id), true, node.id);
});

test('omega accepts an array of destination nodes', () => {
  const s = cone.support(seeds.red, ['red_rescue']);
  assert.equal(s.has('red_start'), true);
});

test('nodes downstream of omega are outside the support', () => {
  // Ω = magi_reveal: magi_love cannot reach Ω, so it is not possible.
  const s = cone.support(seeds.magi, 'magi_reveal');
  assert.equal(s.has('magi_reveal'), true);
  assert.equal(s.has('magi_love'), false);
});

test('a branch without rejoin is rim: forward-reachable but not in support', () => {
  const graph = engine.normalizeGraph(clone(seeds.red));
  engine.addBranch(graph, 'red_wolf', { id: 'branch_dangling', label: 'Wolf gives up' });
  const s = cone.support(graph, 'red_rescue');
  const r = cone.rim(graph, 'red_rescue');
  assert.equal(s.has('branch_dangling'), false);
  assert.equal(r.has('branch_dangling'), true);
  assert.equal(r.has('red_wolf'), false);
});

test('a branch that rejoins upstream of omega is inside the support', () => {
  const graph = engine.normalizeGraph(clone(seeds.red));
  engine.addBranch(graph, 'red_wolf', { id: 'branch_rejoin', label: 'Red runs ahead' },
    'red_recognition');
  const s = cone.support(graph, 'red_rescue');
  assert.equal(s.has('branch_rejoin'), true);
});

// --- §8.3.3 width profile and waists ----------------------------------

test('magi width profile breathes: 1,2,2,1,1 toward magi_love', () => {
  const profile = cone.widthProfile(seeds.magi, 'magi_love');
  assert.deepEqual(profile.map((p) => p.width), [1, 2, 2, 1, 1]);
  assert.deepEqual(profile[1].nodes.sort(), ['magi_jim_watch', 'magi_sell_hair']);
});

test('magi reveal is the width-1 waist (hand-computed §8.3.3 answer)', () => {
  const waists = cone.waists(seeds.magi, 'magi_love');
  assert.deepEqual(waists, [{ level: 3, width: 1, nodes: ['magi_reveal'] }]);
});

test('red: every interior node of a linear chain is a width-1 waist', () => {
  const waists = cone.waists(seeds.red, 'red_rescue');
  assert.deepEqual(waists.map((w) => w.nodes), [
    ['red_woods'], ['red_wolf'], ['red_delay'], ['red_grandma'],
    ['red_disguise'], ['red_recognition'],
  ]);
  assert.equal(waists.every((w) => w.width === 1), true);
});

test('a pure diamond has no interior waist (wide middle is not a minimum)', () => {
  const diamond = {
    root: 's',
    nodes: [{ id: 's' }, { id: 'a' }, { id: 'b' }, { id: 't' }],
    edges: [
      { id: 'e1', from: 's', to: 'a', type: 'causes' },
      { id: 'e2', from: 's', to: 'b', type: 'causes' },
      { id: 'e3', from: 'a', to: 't', type: 'causes' },
      { id: 'e4', from: 'b', to: 't', type: 'causes' },
    ],
  };
  assert.deepEqual(cone.waists(diamond, 't'), []);
});

test('an edge spanning a level makes its cut unclean and counts in the width', () => {
  // s→a→t plus shortcut s→t: level 1 = {a} but the shortcut crosses it.
  const shortcut = {
    root: 's',
    nodes: [{ id: 's' }, { id: 'a' }, { id: 't' }],
    edges: [
      { id: 'e1', from: 's', to: 'a', type: 'causes' },
      { id: 'e2', from: 'a', to: 't', type: 'causes' },
      { id: 'e3', from: 's', to: 't', type: 'causes' },
    ],
  };
  const profile = cone.widthProfile(shortcut, 't');
  assert.equal(profile[1].width, 2);
  assert.deepEqual(profile[1].nodes, ['a']);
  assert.deepEqual(cone.waists(shortcut, 't'), []);
});

// --- §8.3.1 Ω designation on seeds -------------------------------------

test('every seed designates omega at terminal nodes, with a non-empty cone', () => {
  for (const [name, seed] of Object.entries(seeds)) {
    assert.equal(Array.isArray(seed.omega) && seed.omega.length > 0, true,
      `${name} lacks omega`);
    for (const w of seed.omega) {
      assert.equal(seed.nodes.some((n) => n.id === w), true, `${name}: ${w} missing`);
      assert.equal(
        seed.edges.some((e) => e.from === w && cone.TRANSITION_EDGE_TYPES.includes(e.type)),
        false, `${name}: ${w} is not terminal`);
    }
    assert.equal(cone.support(seed, seed.omega).has(seed.root), true,
      `${name}: source cannot reach omega`);
  }
});

// --- §8.3.3 Menger width and cut-criticality ---------------------------

test('menger width: vertex-disjoint path counts on red and magi', () => {
  assert.equal(cone.mengerWidth(seeds.red, 'red_rescue'), 1);
  // toward magi_love everything funnels through the width-1 reveal waist
  assert.equal(cone.mengerWidth(seeds.magi, 'magi_love'), 1);
  // toward magi_reveal the two sacrifice chains are vertex-disjoint
  assert.equal(cone.mengerWidth(seeds.magi, 'magi_reveal'), 2);
});

test('red: every edge of a linear chain is maximally critical', () => {
  for (const e of seeds.red.edges) {
    assert.equal(cone.criticality(seeds.red, 'red_rescue', e.id), 1, e.id);
  }
});

test('magi toward magi_love: parallel-chain edges are redundant, the waist edge is critical', () => {
  assert.equal(cone.criticality(seeds.magi, 'magi_love', 'e_magi_start_magi_sell_hair_causes'), 0);
  assert.equal(cone.criticality(seeds.magi, 'magi_love', 'e_magi_jim_watch_magi_jim_combs_causes'), 0);
  assert.equal(cone.criticality(seeds.magi, 'magi_love', 'e_magi_reveal_magi_love_causes'), 1);
});

test('magi toward magi_reveal: each chain edge costs one disjoint route', () => {
  assert.equal(cone.criticality(seeds.magi, 'magi_reveal', 'e_magi_start_magi_sell_hair_causes'), 1);
});

test('edges outside the support and annotation edges have zero criticality', () => {
  // reveal→love lies downstream of Ω=magi_reveal; parallels is annotation
  assert.equal(cone.criticality(seeds.magi, 'magi_reveal', 'e_magi_reveal_magi_love_causes'), 0);
  assert.equal(cone.criticality(seeds.magi, 'magi_love', 'e_magi_sell_hair_magi_jim_watch_parallels'), 0);
});

test('edgeCriticalities maps every in-support transition edge', () => {
  const crit = cone.edgeCriticalities(seeds.magi, 'magi_reveal');
  assert.deepEqual(crit, {
    e_magi_start_magi_sell_hair_causes: 1,
    e_magi_sell_hair_magi_buy_chain_causes: 1,
    e_magi_buy_chain_magi_reveal_causes: 1,
    e_magi_start_magi_jim_watch_causes: 1,
    e_magi_jim_watch_magi_jim_combs_causes: 1,
    e_magi_jim_combs_magi_reveal_causes: 1,
  });
});

// --- §8.3.3 agent influence = aggregate criticality of attributed edges --

test('magi agents aggregate their attributed transitions toward magi_reveal', () => {
  const { lexicon } = require('../magi_fixture');
  const weights = cone.agentInfluence(seeds.magi, 'magi_reveal', lexicon);
  // chain edges are attributed via the target node's action entry's
  // agent argument; edges into the actionless reveal stay unattributed
  assert.deepEqual(weights, { della: 2, jim: 2 });
});

test('red agents aggregate toward red_rescue', () => {
  const { lexicon } = require('../red_fixture');
  const weights = cone.agentInfluence(seeds.red, 'red_rescue', lexicon);
  assert.deepEqual(weights, { red: 2, wolf: 2 });
});

test('meta-agent influence aggregates its constituents', () => {
  assert.deepEqual(
    cone.metaAgentInfluence({ della: 2, jim: 2 }, { couple: ['della', 'jim'] }),
    { couple: 4 });
});

// --- §8.3.3 nodeAgent: who acts at a node (attribution helper) ----------

test('nodeAgent returns the acting agent or null', () => {
  const { lexicon: redLex } = require('../red_fixture');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_wolf'), 'wolf');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_grandma'), 'wolf');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_recognition'), null); // no action
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'nope'), null);            // no such node
});

// --- §7.8 realized frontier = Phi(v) ∩ cone -----------------------------

test('realized frontier drops candidates that match rim nodes, keeps support and novel ones', () => {
  const graph = engine.normalizeGraph(clone(seeds.red));
  engine.addBranch(graph, 'red_wolf', { id: 'b_dangle', expr: 'flee(wolf)' });
  engine.addBranch(graph, 'red_wolf', { id: 'b_loop', expr: 'warn(red)' }, 'red_recognition');
  const candidates = [{ expr: 'flee(wolf)' }, { expr: 'warn(red)' }, { expr: 'novel(thing)' }];
  const realized = cone.realizedFrontier(graph, 'red_rescue', 'red_wolf', candidates);
  assert.deepEqual(realized.map((c) => c.expr), ['warn(red)', 'novel(thing)']);
});

test('realized frontier is empty at a rim node (no continuation toward omega)', () => {
  const graph = engine.normalizeGraph(clone(seeds.red));
  engine.addBranch(graph, 'red_wolf', { id: 'b_dangle', expr: 'flee(wolf)' });
  const realized = cone.realizedFrontier(graph, 'red_rescue', 'b_dangle', [{ expr: 'x(y)' }]);
  assert.deepEqual(realized, []);
});

test('annotation edges (parallels/foreshadows) do not carry reachability', () => {
  // magi's parallels edge sell_hair→jim_watch is symbolic; if it carried
  // reachability, jim_watch would stay reachable after cutting magi_start→jim_watch.
  const graph = clone(seeds.magi);
  graph.edges = graph.edges.filter((e) => !(e.from === 'magi_start' && e.to === 'magi_jim_watch'));
  const s = cone.support(graph, 'magi_love');
  assert.equal(s.has('magi_jim_watch'), false);
  assert.equal(s.has('magi_sell_hair'), true);
});
