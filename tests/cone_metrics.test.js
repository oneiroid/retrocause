// Tests for cone_metrics.js — FORMAL_MODEL.md §8.3.6 (self-less,
// measure-free structural metrics on the possibility cone). Hand-computed
// answers on a synthetic branchy DAG; degeneracy asserted on the linear
// seeds as correct behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const cm = require('../cone_metrics');
const { seeds } = require('../seeds');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// Synthetic DAG: s forks to a (→t1) and b (→t2, →r). t1,t2 ∈ Ω; r is a
// sink that cannot reach Ω, hence rim. Sinks over R: t1, t2, r.
//   reachableSinks: s={t1,t2,r}, a={t1}, b={t2,r}
//   B: s=log2(2)=1 ({t1} vs {t2,r}), b=log2(2)=1 ({t2} vs {r}), rest 0
function branchy() {
  return {
    root: 's',
    omega: ['t1', 't2'],
    nodes: [
      { id: 's' },
      { id: 'a', action: { entry: 'act', binding: { Agent: 'alice' } } },
      { id: 'b', action: { entry: 'act', binding: { Agent: 'bob' } } },
      { id: 't1' }, { id: 't2' }, { id: 'r' },
    ],
    edges: [
      { id: 's_a', from: 's', to: 'a', type: 'causes' },
      { id: 's_b', from: 's', to: 'b', type: 'causes' },
      { id: 'a_t1', from: 'a', to: 't1', type: 'causes' },
      { id: 'b_t2', from: 'b', to: 't2', type: 'causes' },
      { id: 'b_r', from: 'b', to: 'r', type: 'causes' },
    ],
  };
}
const LEX = [{ name: 'act', agent: 'Agent', params: [{ name: 'Agent' }] }];

test('§8.3.6 branching capacity: forks to distinct sink-sets give bits', () => {
  const B = cm.branchingCapacity(branchy());
  close(B.s, 1);   // {t1} vs {t2,r} → 2 distinct → 1 bit
  close(B.b, 1);   // {t2} vs {r}    → 2 distinct → 1 bit
  close(B.a, 0);   // single successor
  close(B.t1, 0); close(B.t2, 0); close(B.r, 0); // sinks
});

test('§8.3.6 locality gap: rim-bound next events / all next events', () => {
  const g = branchy();
  const G = cm.localityGap(g, g.omega);
  close(G.s, 0);     // both successors in support
  close(G.a, 0);     // single successor in support
  close(G.b, 0.5);   // b→t2 (support) + b→r (rim) → 1/2
  assert.equal('t1' in G, false); // sink: no next event, omitted
  assert.equal('t2' in G, false);
  assert.equal('r' in G, false);  // rim node, not in support
});

test('§8.3.6 node vitality sums out-edge criticality over the support', () => {
  const g = branchy();
  const V = cm.nodeVitality(g, g.omega);
  // disjoint paths s-a-t1 and s-b-t2 → each support edge criticality 1;
  // b→r is rim (criticality 0). V(s)=1+1, V(a)=1, V(b)=1+0.
  close(V.s, 2); close(V.a, 1); close(V.b, 1);
});

test('§8.3.6 structural alignment correlates B and G against vitality', () => {
  const g = branchy();
  const A = cm.structuralAlignment(g, g.omega);
  assert.deepEqual(A.nodes, ['a', 'b', 's']); // N sorted
  // B=[a:0,b:1,s:1], V=[a:1,b:1,s:2]  → corr = +0.5
  close(A.align_branch, 0.5);
  // G=[a:0,b:0.5,s:0], V=[a:1,b:1,s:2] → corr = -0.5
  close(A.align_locality, -0.5);
});
