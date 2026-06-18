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
