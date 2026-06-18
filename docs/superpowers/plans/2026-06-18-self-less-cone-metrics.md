# Self-less Cone Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add measure-free, self-less structural metrics on the possibility cone — branching capacity `B(v)`, locality gap `G(v)`, and structural alignment — with agents surviving only as an optional metadata overlay.

**Architecture:** New module `cone_metrics.js` depends on `cone.js`. The agent-attribution logic is factored out of `cone.js`'s `agentInfluence` into a shared exported `nodeAgent`, so structure stays primary and agents are a thin `groupByAgent` overlay. All quantities are combinatorial (counts, set fractions, Menger vitality) — no probability measure over paths.

**Tech Stack:** Plain ES5-ish JavaScript, dual-mode IIFE modules (browser `<script>` + Node `require`), `node:test` + `node:assert/strict`. No build step, no new dependencies.

## Global Constraints

- **Dual-mode IIFE.** Every source file is `(function attachX(root){ … })(typeof window !== "undefined" ? window : globalThis)` exporting via both `module.exports` and `root.RetrocauseX`. New module follows this verbatim.
- **Measure-free.** No probability measure over paths anywhere (reparametrization-trap guard, FORMAL_MODEL §8.3.4). Counts, set fractions, and existing Menger vitality only.
- **No identifier named `capability`** for these quantities (drift guard: that was an agent word). Module/functions use structural names (`branchingCapacity`, `localityGap`, `structuralAlignment`).
- **Influence ≠ capability.** Do not rename or repurpose vitality; `cone.js` influence stays as-is.
- **Agents are metadata only.** Agents appear solely in `groupByAgent` / `nodeAgent`; never as graph structure.
- **Section anchors in comments.** Cite `FORMAL_MODEL.md` §8.3.5 / §8.3.6 in code headers, matching existing `cone.js` style.
- **Tests:** `npm test` runs `node --check` on every source file then `node --test tests/*.test.js`. Keep all existing tests green.
- **Transition edges:** reachability/branching run over `cone.TRANSITION_EDGE_TYPES` (`causes`/`choice`/`rejoins`) only — never annotation edges.

---

### Task 1: Factor `nodeAgent` out of `cone.js`

Extract the agent-attribution logic so it is shared by `agentInfluence` and the new overlay. `agentInfluence` output must stay byte-identical (existing tests are the regression guard).

**Files:**
- Modify: `cone.js` (add `nodeAgent`, rewrite `agentInfluence` body, add to `api`)
- Test: `tests/cone.test.js` (add one `nodeAgent` test; existing tests are the regression)

**Interfaces:**
- Produces: `cone.nodeAgent(graph, lexicon, nodeId) -> string | null` — the agent that acts at `nodeId`, i.e. `binding[entry.agent]` of the node's `action`, or `null` if the node has no action / the entry has no `agent` param.

- [ ] **Step 1: Write the failing test**

Add to `tests/cone.test.js` (after the agent-influence block, ~line 189):

```javascript
// --- §8.3.3 nodeAgent: who acts at a node (attribution helper) ----------

test('nodeAgent returns the acting agent or null', () => {
  const { lexicon: redLex } = require('../red_fixture');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_wolf'), 'wolf');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_grandma'), 'wolf');
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'red_recognition'), null); // no action
  assert.equal(cone.nodeAgent(seeds.red, redLex, 'nope'), null);            // no such node
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="nodeAgent returns" tests/cone.test.js`
Expected: FAIL — `cone.nodeAgent is not a function`.

- [ ] **Step 3: Add `nodeAgent` and rewrite `agentInfluence` to use it**

In `cone.js`, immediately **before** `function agentInfluence(`, insert:

```javascript
  // §8.3.3 attribution: the agent that acts at a node = the entry's
  // agent argument bound by the node's `action` (§7.8). Attribution is
  // metadata, never structure. Shared by agentInfluence and the
  // self-less overlay groupByAgent (cone_metrics.js, §8.3.6).
  function nodeAgent(graph, lexicon, nodeId) {
    const node = (graph.nodes || []).find((n) => n.id === nodeId);
    const action = node && node.action;
    if (!action) return null;
    const entry = (lexicon || []).find((e) => e.name === action.entry);
    if (!entry || !entry.agent) return null;
    return (action.binding || {})[entry.agent] || null;
  }
```

Then replace the body of `agentInfluence` with:

```javascript
  function agentInfluence(graph, omega, lexicon) {
    const crit = edgeCriticalities(graph, omega);
    const weights = {};
    for (const e of transitionEdges(graph)) {
      if (!(e.id in crit)) continue;
      const agent = nodeAgent(graph, lexicon, e.to);
      if (!agent) continue;
      weights[agent] = (weights[agent] || 0) + crit[e.id];
    }
    return weights;
  }
```

Add `nodeAgent` to the `api` object (the `const api = { … }` near the bottom):

```javascript
    agentInfluence, metaAgentInfluence, realizedFrontier, nodeAgent,
```

- [ ] **Step 4: Run the full cone test file (regression + new test)**

Run: `node --test tests/cone.test.js`
Expected: PASS — all existing tests still green (notably the `agentInfluence` tests returning `{ della: 2, jim: 2 }` and `{ red: 2, wolf: 2 }`), plus the new `nodeAgent` test.

- [ ] **Step 5: Commit**

```bash
git add cone.js tests/cone.test.js
git commit -m "refactor: extract cone.nodeAgent shared by agentInfluence"
```

---

### Task 2: `cone_metrics.js` scaffold + branching capacity `B(v)`

Create the module and the first self-less metric: branching capacity (self-less empowerment), off-Ω, over the raw graph R.

**Files:**
- Create: `cone_metrics.js`
- Test: `tests/cone_metrics.test.js`

**Interfaces:**
- Consumes: `cone.transitionEdges(graph)`, `cone.TRANSITION_EDGE_TYPES`.
- Produces:
  - `branchingCapacity(graph) -> { [nodeId]: bits }` — for each node, `log2(#distinct downstream sink-sets across its forward-successors)`; `0` for out-degree ≤ 1 or when all successors reach the same sink-set. Off-Ω (whole R).
  - (internal, exported for reuse) `reachableSinks(graph) -> Map<nodeId, Set<sinkId>>` — sinks (no transition out-edge) forward-reachable from each node over R.

- [ ] **Step 1: Write the failing test**

Create `tests/cone_metrics.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cone_metrics.test.js`
Expected: FAIL — `Cannot find module '../cone_metrics'`.

- [ ] **Step 3: Create `cone_metrics.js` with the scaffold and `branchingCapacity`**

```javascript
// Self-less cone metrics. FORMAL_MODEL.md §8.3.6: the capability apparatus
// of §8.3.5 recast onto structural loci, measure-free. Branching capacity
// B(v) is self-less empowerment (off-Ω); locality gap G(v) is the local
// slope of the simulation gradient; structural alignment is self-less η.
// Agents survive only as the groupByAgent overlay — metadata, never
// structure (cf. cone.js agentInfluence; INTUITIONS claim 9: the self-less
// case is the simulation-gradient base, an agent carries a model on top).
//
// Measure-free throughout: counts, set fractions, and cone.js Menger
// vitality — no probability measure over paths (avoids the §8.3.4
// reparametrization trap).

(function attachConeMetrics(root) {
  const Cone = (typeof module !== "undefined" && module.exports)
    ? require("./cone.js")
    : root.RetrocauseCone;

  // Forward transition adjacency over the raw graph R.
  function forwardAdj(graph) {
    const adj = new Map();
    for (const n of graph.nodes || []) adj.set(n.id, []);
    for (const e of Cone.transitionEdges(graph)) {
      if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
    }
    return adj;
  }

  // §8.3.6: for each node, the set of sinks (no transition out-edge)
  // forward-reachable from it over R. Memoized DFS; the graph is a DAG.
  function reachableSinks(graph) {
    const adj = forwardAdj(graph);
    const memo = new Map();
    function visit(v) {
      if (memo.has(v)) return memo.get(v);
      const succ = adj.get(v) || [];
      const out = new Set();
      if (succ.length === 0) { out.add(v); }       // v is a sink
      else for (const s of succ) for (const k of visit(s)) out.add(k);
      memo.set(v, out);
      return out;
    }
    for (const id of adj.keys()) visit(id);
    return memo;
  }

  // §8.3.6 branching capacity (self-less empowerment), off-Ω:
  //   B(v) = log2(# distinct downstream sink-sets across v's successors).
  // Out-degree ≤ 1, or all successors reaching the same sink-set → 0.
  function branchingCapacity(graph) {
    const adj = forwardAdj(graph);
    const sinks = reachableSinks(graph);
    const out = {};
    for (const id of adj.keys()) {
      const succ = adj.get(id) || [];
      if (succ.length === 0) { out[id] = 0; continue; }
      const distinct = new Set(
        succ.map((s) => [...sinks.get(s)].sort().join("|")));
      out[id] = Math.log2(distinct.size);
    }
    return out;
  }

  const api = { reachableSinks, branchingCapacity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseConeMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cone_metrics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cone_metrics.js tests/cone_metrics.test.js
git commit -m "feat: cone_metrics branching capacity B(v) (self-less empowerment)"
```

---

### Task 3: Locality gap `G(v)`

Per-node rim-fraction of next events — self-less accuracy / "how non-local is the constraint on the next event."

**Files:**
- Modify: `cone_metrics.js`
- Test: `tests/cone_metrics.test.js`

**Interfaces:**
- Consumes: `cone.support(graph, omega)`, `cone.rim(graph, omega)`, `cone.transitionEdges(graph)`.
- Produces: `localityGap(graph, omega) -> { [nodeId]: fraction }` — for each support node with ≥1 transition out-edge: `|out-edges → rim| / |out-edges|` ∈ [0,1]. Support nodes with no transition out-edge (sinks/Ω) are omitted.

- [ ] **Step 1: Write the failing test**

Add to `tests/cone_metrics.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="locality gap" tests/cone_metrics.test.js`
Expected: FAIL — `cm.localityGap is not a function`.

- [ ] **Step 3: Implement `localityGap`**

In `cone_metrics.js`, add before the `const api = …` line:

```javascript
  // §8.3.6 locality gap (self-less accuracy / non-locality of the
  // next-event constraint): the fraction of a support node's locally-
  // possible next events that knowing Ω forbids. Operationalizes the
  // project thesis "knowing the destination constrains the routes" as a
  // per-node number, at the 1-step next-event grain. Reuses cone.rim.
  function localityGap(graph, omega) {
    const inCone = Cone.support(graph, omega);
    const rimSet = Cone.rim(graph, omega);
    const outdeg = new Map();
    const rimOut = new Map();
    for (const e of Cone.transitionEdges(graph)) {
      if (!inCone.has(e.from)) continue;          // only support nodes have a constrained next event
      outdeg.set(e.from, (outdeg.get(e.from) || 0) + 1);
      if (rimSet.has(e.to)) rimOut.set(e.from, (rimOut.get(e.from) || 0) + 1);
    }
    const out = {};
    for (const [id, deg] of outdeg) out[id] = (rimOut.get(id) || 0) / deg;
    return out;
  }
```

Add `localityGap` to the `api` object:

```javascript
  const api = { reachableSinks, branchingCapacity, localityGap };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cone_metrics.test.js`
Expected: PASS (both branching and locality tests).

- [ ] **Step 5: Commit**

```bash
git add cone_metrics.js tests/cone_metrics.test.js
git commit -m "feat: cone_metrics locality gap G(v) (next-event non-locality)"
```

---

### Task 4: Node vitality + structural alignment (self-less η)

Aggregate edge vitality to nodes, then correlate branching/locality against vitality across the support nodes that have a next event.

**Files:**
- Modify: `cone_metrics.js`
- Test: `tests/cone_metrics.test.js`

**Interfaces:**
- Consumes: `cone.edgeCriticalities(graph, omega)`, `cone.transitionEdges(graph)`, `cone.support(graph, omega)`, plus `branchingCapacity`, `localityGap` (this module).
- Produces:
  - `nodeVitality(graph, omega) -> { [nodeId]: sumCriticality }` — sum of `cone.edgeCriticalities` over a node's transition out-edges (edges absent from the map count 0). Includes every support node with ≥1 transition out-edge (value 0 if all its out-edges are rim-bound / out-of-support).
  - `structuralAlignment(graph, omega) -> { align_branch, align_locality, nodes, perNode }` where `align_*` are Pearson correlations across the node set `N` (support nodes with ≥1 transition out-edge) or `null` (when `|N| < 2` or zero variance); `nodes` is the sorted `N`; `perNode[id] = { B, G, V }`.

- [ ] **Step 1: Write the failing test**

Add to `tests/cone_metrics.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="vitality|structural alignment" tests/cone_metrics.test.js`
Expected: FAIL — `cm.nodeVitality is not a function`.

- [ ] **Step 3: Implement `nodeVitality`, a Pearson helper, and `structuralAlignment`**

In `cone_metrics.js`, add before the `const api = …` line:

```javascript
  // §8.3.6 node vitality = Σ cut-criticality of a node's transition
  // out-edges (cone.edgeCriticalities; rim/out-of-support edges = 0).
  function nodeVitality(graph, omega) {
    const crit = Cone.edgeCriticalities(graph, omega);
    const inCone = Cone.support(graph, omega);
    const out = {};
    for (const e of Cone.transitionEdges(graph)) {
      if (!inCone.has(e.from)) continue;
      out[e.from] = (out[e.from] || 0) + (crit[e.id] || 0);
    }
    return out;
  }

  // Pearson correlation; null when n < 2 or either series is constant.
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  // §8.3.6 structural alignment (self-less η): across support nodes that
  // have a next event (N), correlate branching capacity and locality gap
  // against node vitality. null when undefined (small-n / zero variance);
  // illustrative, not statistical, at seed scale.
  function structuralAlignment(graph, omega) {
    const B = branchingCapacity(graph);
    const G = localityGap(graph, omega);
    const V = nodeVitality(graph, omega);
    const nodes = Object.keys(V).sort(); // V is keyed exactly by N
    const perNode = {};
    for (const id of nodes) perNode[id] = { B: B[id] || 0, G: G[id] || 0, V: V[id] };
    return {
      align_branch: pearson(nodes.map((id) => perNode[id].B), nodes.map((id) => perNode[id].V)),
      align_locality: pearson(nodes.map((id) => perNode[id].G), nodes.map((id) => perNode[id].V)),
      nodes,
      perNode,
    };
  }
```

Add the three public functions to `api`:

```javascript
  const api = {
    reachableSinks, branchingCapacity, localityGap,
    nodeVitality, structuralAlignment,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cone_metrics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cone_metrics.js tests/cone_metrics.test.js
git commit -m "feat: cone_metrics structural alignment (self-less eta)"
```

---

### Task 5: `groupByAgent` overlay + degeneracy assertions on the seeds

The optional metadata overlay, plus the spec's required proof that the bare linear seeds are correctly degenerate.

**Files:**
- Modify: `cone_metrics.js`
- Test: `tests/cone_metrics.test.js`

**Interfaces:**
- Consumes: `cone.nodeAgent(graph, lexicon, nodeId)` (Task 1).
- Produces: `groupByAgent(nodeValues, graph, lexicon) -> { [agent]: sum }` — sums a node-keyed metric map by the agent acting at each node; nodes with no acting agent are dropped. Metadata only.

- [ ] **Step 1: Write the failing tests**

Add to `tests/cone_metrics.test.js`:

```javascript
test('§8.3.6 groupByAgent sums a node metric by the acting agent (overlay)', () => {
  const g = branchy();
  const B = cm.branchingCapacity(g);     // a:0, b:1, others 0 / unattributed
  const byAgent = cm.groupByAgent(B, g, LEX);
  assert.deepEqual(byAgent, { alice: 0, bob: 1 }); // s/t1/t2/r have no action
});

test('§8.3.6 bare linear seeds are correctly degenerate (B=0, G=0, alignment null)', () => {
  for (const name of ['red', 'magi']) {
    const seed = seeds[name];
    const B = cm.branchingCapacity(seed);
    for (const v of Object.values(B)) close(v, 0);          // no agentic control on a determined/reconverging chain
    const G = cm.localityGap(seed, seed.omega);
    for (const v of Object.values(G)) close(v, 0);          // no rim → nothing pruned
    const A = cm.structuralAlignment(seed, seed.omega);
    assert.equal(A.align_branch, null);                     // B has zero variance
    assert.equal(A.align_locality, null);                   // G has zero variance
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern="groupByAgent|degenerate" tests/cone_metrics.test.js`
Expected: `groupByAgent` test FAILS (`cm.groupByAgent is not a function`); the degeneracy test fails on the same missing-symbol load or, once loadable, must pass.

- [ ] **Step 3: Implement `groupByAgent`**

In `cone_metrics.js`, add before the `const api = …` line:

```javascript
  // §8.3.6 agent overlay (metadata, NOT structure): sum a node-keyed
  // metric by the agent acting at each node (cone.nodeAgent, §8.3.3).
  // The institutional/meritocracy reading of η lives here and only here;
  // self-lessly it is unavailable. Mirrors cone.agentInfluence.
  function groupByAgent(nodeValues, graph, lexicon) {
    const out = {};
    for (const [id, value] of Object.entries(nodeValues || {})) {
      const agent = Cone.nodeAgent(graph, lexicon, id);
      if (!agent) continue;
      out[agent] = (out[agent] || 0) + value;
    }
    return out;
  }
```

Add `groupByAgent` to `api`:

```javascript
  const api = {
    reachableSinks, branchingCapacity, localityGap,
    nodeVitality, structuralAlignment, groupByAgent,
  };
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — every file passes `node --check`; all `cone_metrics.test.js` tests pass; all pre-existing tests (`cone.test.js` etc.) stay green.

- [ ] **Step 5: Commit**

```bash
git add cone_metrics.js tests/cone_metrics.test.js
git commit -m "feat: cone_metrics groupByAgent overlay + seed degeneracy tests"
```

---

### Task 6: Documentation — FORMAL_MODEL §8.3.5/§8.3.6 + INTUITIONS

Record the model changes and the primacy inversion as data in both docs (CLAUDE.md conflict rule).

**Files:**
- Modify: `FORMAL_MODEL.md` (§8.3.5 tail; new §8.3.6 after it)
- Modify: `INTUITIONS.md` (claim 9 / Open-Q 9 — the agency block around lines 183–256, 349–360)

- [ ] **Step 1: Append the primacy-inversion note to FORMAL_MODEL §8.3.5**

In `FORMAL_MODEL.md`, at the end of §8.3.5 (just before the `---` that precedes `## 9`), append:

```markdown

**Self-less recast (2026-06-18; see
`docs/superpowers/specs/2026-06-18-self-less-cone-metrics-design.md` and
§8.3.6).** The three measures above are phrased as *agent* properties. They are
now derived **self-lessly on structural loci**, with agents surviving only as an
optional metadata overlay — consistent with this model's stance that attribution
is metadata, not structure, and with INTUITIONS claim 9's *simulation gradient*
(the non-agent case is the base; an agent adds a model on top). **Data-flag (per
the CLAUDE.md conflict rule):** this *inverts the primacy* of §8.3.5's
agent-first phrasing (structural loci primary, agents derived) without deleting
the agentic reading — it returns as the overlay. Hole (iii) "no independent
DAG-internal measure" thereby moves from `open` to `partial`; holes (i)
capability ≠ alignment and (ii) reverse causation remain `open`.
```

- [ ] **Step 2: Add new §8.3.6 after §8.3.5**

In `FORMAL_MODEL.md`, insert immediately after the text added in Step 1 (still before `## 9`):

```markdown
#### 8.3.6 Self-less reformulation: branching, locality, alignment  `partial`

The capability apparatus of §8.3.5, recast onto structural loci, measure-free
(no probability measure over paths — avoids §8.3.4's reparametrization trap).
Implemented in `cone_metrics.js`, tested on a synthetic branchy DAG and asserted
degenerate on the bare seeds.

- **Branching capacity `B(v)` (self-less empowerment).** Over the raw graph R,
  off-Ω: `B(v) = log₂(# distinct downstream sink-sets across v's successors)`.
  Out-degree ≤ 1, or successors that reconverge to the same sinks → 0. It
  measures how much the next-event selection *at v* diversifies the reachable
  future, with no chooser named. Off-Ω is what decouples it from influence
  (which is Ω-gated): a locus at a width-1 Ω-waist can have `B = 0`.
- **Locality gap `G(v)`.** Per support node: `G(v) = |out-edges → rim| /
  |out-edges|` — the fraction of v's locally-possible next events that knowing Ω
  forbids. This operationalizes the thesis "knowing the destination constrains
  the routes" (INTUITIONS §5) as a per-node number, at the 1-step next-event
  grain. It is the **local slope of the simulation gradient**: where `G = 0`
  bare least-action suffices (a model buys nothing); where `G` is high the
  constraint is non-local and carrying a model would pay. Self-less, yet it
  explains where agency emerges.
- **Structural alignment (self-less η).** Across the support nodes that have a
  next event: `align_branch = corr(B, V)` and `align_locality = corr(G, V)`,
  with `V(v)` = node vitality (Σ out-edge cut-criticality, §8.3.3). `null` when
  undefined (small-n / zero variance). It asks whether forking and
  non-local-constraint loci coincide with load-bearing loci; B and V may
  *anti*-correlate by construction (forced waists vs. slack forks) — a
  structural signature, not a defect. **Illustrative, not statistical, at seed
  scale.**
- **Agents = overlay only.** `groupByAgent` sums any per-node metric by the agent
  acting at each node (`cone.nodeAgent`). The institutional / meritocracy
  ("failed states") reading of η lives here and only here; self-lessly it is
  unavailable, because "the capable were denied power" needs a self to be
  capable.

On the bare seeds every locus is degenerate (`B = 0`, `G = 0`, alignment
`null`) — correctly: a determined or parallel-reconverging chain affords no
agentic control and prunes no next event. The metrics come alive only on a
*widened* cone (counterfactual branches), which is the tool's purpose.
```

- [ ] **Step 3: Update INTUITIONS claim 9 / Open-Q 9**

In `INTUITIONS.md`, at the end of the claim-9 paragraph that begins "The cone is influence-weighted" (the block around lines 243–257), append:

```markdown
  **Self-less recast (2026-06-18, FORMAL_MODEL §8.3.6):** these capability
  measures are now derived on *structural loci* — branching capacity `B(v)`
  (self-less empowerment), locality gap `G(v)` (the local slope of *this*
  simulation gradient), and structural alignment (self-less η) — with agents
  surviving only as a metadata overlay. This is the simulation gradient's own
  base case (non-agent = bare least-action), so it is no conflict; but it
  *inverts the primacy* of the agent-first phrasing above, recorded here as data
  per the CLAUDE.md conflict rule, not silently rewritten.
```

Then in Open-Q 9 (the block around lines 349–360, "The capability↔influence
bridge"), append:

```markdown
   **Update (2026-06-18):** capability now has self-less, measure-free,
   DAG-internal proxies (`cone_metrics.js`, §8.3.6): branching capacity, locality
   gap, structural alignment. The independent-measurability hole moves to
   `partial`; capability ≠ alignment and reverse causation stay `open`. η as a
   self-less *alignment* is a number on widened cones; η as an institutional
   selection gradient remains an agent-overlay reading.
```

- [ ] **Step 4: Verify the docs reference real symbols and the suite is green**

Run: `npm test`
Expected: PASS (docs changes do not affect tests; this confirms nothing was broken). Manually confirm §8.3.6 names match the exported function names (`branchingCapacity`, `localityGap`, `nodeVitality`, `structuralAlignment`, `groupByAgent`, `cone.nodeAgent`).

- [ ] **Step 5: Commit**

```bash
git add FORMAL_MODEL.md INTUITIONS.md
git commit -m "docs: §8.3.6 self-less cone metrics; log primacy inversion as data"
```

---

## Self-Review

**1. Spec coverage:**
- Spec §2 module / attribution refactor → Task 1 (`nodeAgent`) + Task 2 (module scaffold). ✓
- Spec §3 branching capacity `B(v)` → Task 2. ✓
- Spec §4 locality gap `G(v)` → Task 3. ✓
- Spec §5 structural alignment + guards + node set → Task 4 (`pearson` null guards; `N` = support nodes with a next event = `Object.keys(nodeVitality)`). ✓
- Spec §6 agent overlay → Task 5 (`groupByAgent`). ✓
- Spec §7 tests: synthetic fixture (Tasks 2–4), degeneracy on bare seeds (Task 5), guard behavior (alignment `null` proven by the degeneracy test's zero-variance seeds), regression on `agentInfluence` (Task 1 Step 4). ✓
- Spec §8 docs (§8.3.5, new §8.3.6, INTUITIONS) → Task 6. ✓
- Spec §9 non-goals: no path measure, no `seeds.js` edits, no Ω derivation, no horizon-r, no `capability` identifier — none of the tasks introduce these. ✓

**2. Placeholder scan:** No TBD/TODO; every code/test step shows complete code and exact commands. ✓

**3. Type consistency:** `cone.nodeAgent(graph, lexicon, nodeId)` defined in Task 1, consumed in Task 5. `branchingCapacity`/`localityGap`/`nodeVitality` defined in Tasks 2–4, consumed by `structuralAlignment` (Task 4) and `groupByAgent` input (Task 5). `reachableSinks` returns `Map`, used internally by `branchingCapacity`. Alignment node set `N` is exactly `Object.keys(nodeVitality(...))` — the support nodes with ≥1 transition out-edge — used consistently in Task 4. The synthetic `branchy()` fixture and `LEX` are defined once at the top of the test file and reused across Tasks 2–5. ✓

One spec note reconciled: the design's §5 edit allowed `align_branch` and `align_locality` to run over *slightly different* node sets; this plan uses the single set `N` (support nodes with a next event) for both, which is within that allowance and simpler. Recorded here so it is a deliberate choice, not a drift.
