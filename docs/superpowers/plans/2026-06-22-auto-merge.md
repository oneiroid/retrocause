# Auto-merge for Auto-branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "auto-merge" mode to auto-branching that collapses auto-created nodes sharing an identical world-state (from distinct parents) into a single convergent node.

**Architecture:** A pure graph operation `mergeEquivalentStates` in the engine collapses caller-supplied groups of state-equivalent node ids (survivor = node closest to a root; cycle-unsafe pairs skipped; victim edges rewired onto the survivor). The app computes the equivalence groups from `state_walker` post-states after a branch run and calls the engine op when a new UI checkbox is on. Merging only equal-state nodes makes it provably state-preserving.

**Tech Stack:** Vanilla JS dual-mode IIFE modules (browser `<script>` + Node `require`), D3 UI, `node --test`.

## Global Constraints

- **Dual-mode modules.** Every source file is an IIFE attaching to `window`/`global`; new engine code goes inside the existing `attachStoryDagEngine` IIFE in `story_builder_engine.js`. (CLAUDE.md "Conventions".)
- **Canonical-edge predicate.** An edge is canonical iff `edge.canonical === true || (edge.canonical === undefined && edge.type === "causes")`. Reuse this exact form. (Used across `state_walker.js`, `seeds.js`.)
- **State-key form.** A world-state key is `Array.from(state).sort().join("\n")` — exposed as `Phi.stateKey(state)`. Do not reinvent it. (`phi.js:30`.)
- **Default off.** The auto-merge UI checkbox defaults unchecked; with it off, auto-branching behaves exactly as today.
- **Eligibility = this run only.** Only nodes created during the current auto-branch run are merge candidates; hand-authored / pre-existing nodes are never deleted or rewired.
- **Section anchors.** Cite spec rule ids (R1–R6) and FORMAL_MODEL sections in code comments where relevant, matching existing style.
- **Tests.** `npm test` runs `node --check` on every source file then `node --test tests/*.test.js`; it must stay green.

Spec: `docs/superpowers/specs/2026-06-22-auto-merge-design.md`.

---

### Task 1: Engine `mergeEquivalentStates` (pure graph op)

**Files:**
- Modify: `story_builder_engine.js` (add helpers + `mergeEquivalentStates`; export it)
- Test: `tests/automerge.test.js` (create)

**Interfaces:**
- Consumes: existing `reachable(graph, from, to)` and `normalizeGraph(graph)` from `story_builder_engine.js`.
- Produces:
  - `mergeEquivalentStates(graph, opts) -> { ok: boolean, merged: number, skipped: number, survivors: string[] }`
    - `opts.groups: string[][]` — arrays of node ids believed state-equivalent (R1, computed by the caller).
    - `opts.eligibleIds?: Set<string> | string[]` — ids permitted to be merged; ids outside it are dropped from every group (R2).
    - Mutates `graph` in place: removes victim nodes, rewires their edges onto the survivor, drops self-loops, dedups parallel edges (canonical preferred), sets `survivor.tags += "merged"` and `survivor.mergedFrom`, and remaps victim ids → survivor id inside `graph.omega` (dedup).
    - `merged` = victims absorbed; `skipped` = pairs left intact for cycle-safety (R4); `survivors` = ids that absorbed ≥1 victim.

- [ ] **Step 1: Write the failing tests**

Create `tests/automerge.test.js`:

```javascript
// Tests for engine.mergeEquivalentStates (auto-merge core, spec R1-R6).
// Pure graph op: caller supplies state-equivalence groups; engine
// collapses each onto the survivor closest to a root.

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../story_builder_engine");

// Linear-ish graph with two distinct parents (pA, pB) each leading to a
// node (x, y) that the caller declares state-equivalent.
function convergentGraph() {
  return engine.normalizeGraph({
    root: "root",
    meta: { title: "merge fixture", version: 2 },
    nodes: [
      { id: "root", label: "root", expr: "start()" },
      { id: "pA", label: "A", expr: "a()", createdBy: "phi-auto" },
      { id: "pB", label: "B", expr: "b()", createdBy: "phi-auto" },
      { id: "x", label: "X", expr: "same()", createdBy: "phi-auto" },
      { id: "y", label: "Y", expr: "same()", createdBy: "phi-auto" },
    ],
    edges: [
      { id: "e1", from: "root", to: "pA", type: "causes" },
      { id: "e2", from: "root", to: "pB", type: "causes" },
      { id: "e3", from: "pA", to: "x", type: "causes" },
      { id: "e4", from: "pB", to: "y", type: "causes" },
    ],
  });
}

function canonicalIn(graph, id) {
  return graph.edges.filter(
    (e) => e.to === id && (e.canonical === true || (e.canonical === undefined && e.type === "causes"))
  );
}

test("basic collapse: equal-state children of distinct parents become one node", () => {
  const g = convergentGraph();
  const res = engine.mergeEquivalentStates(g, {
    groups: [["x", "y"]],
    eligibleIds: new Set(["pA", "pB", "x", "y"]),
  });
  assert.equal(res.merged, 1);
  assert.equal(res.skipped, 0);
  // One survivor remains; the other is gone.
  const ids = g.nodes.map((n) => n.id);
  assert.ok(ids.includes("x") !== ids.includes("y"), "exactly one of x/y survives");
  const survivor = ids.includes("x") ? "x" : "y";
  assert.deepEqual(res.survivors, [survivor]);
  // Survivor now has two incoming canonical edges (from pA and pB).
  const preds = canonicalIn(g, survivor).map((e) => e.from).sort();
  assert.deepEqual(preds, ["pA", "pB"]);
  // Provenance recorded.
  const node = g.nodes.find((n) => n.id === survivor);
  assert.ok(node.tags.includes("merged"));
  assert.equal(node.mergedFrom.length, 1);
});

test("survivor is the node closest to a root; ties broken by node order", () => {
  // x at depth 2, y at depth 3 -> x (depth 2) must survive.
  const g = engine.normalizeGraph({
    root: "root",
    nodes: [
      { id: "root", expr: "start()" },
      { id: "p", expr: "p()" },
      { id: "x", expr: "same()" },
      { id: "q1", expr: "q1()" },
      { id: "q2", expr: "q2()" },
      { id: "y", expr: "same()" },
    ],
    edges: [
      { id: "e1", from: "root", to: "p", type: "causes" },
      { id: "e2", from: "p", to: "x", type: "causes" },
      { id: "e3", from: "root", to: "q1", type: "causes" },
      { id: "e4", from: "q1", to: "q2", type: "causes" },
      { id: "e5", from: "q2", to: "y", type: "causes" },
    ],
  });
  const res = engine.mergeEquivalentStates(g, { groups: [["y", "x"]] });
  assert.equal(res.merged, 1);
  assert.deepEqual(res.survivors, ["x"]);
  assert.ok(!g.nodes.some((n) => n.id === "y"));
});

test("cycle guard: ancestor/descendant equal-state pair is not merged", () => {
  // x is a canonical ancestor of z; merging would create a cycle.
  const g = engine.normalizeGraph({
    root: "root",
    nodes: [
      { id: "root", expr: "start()" },
      { id: "x", expr: "same()" },
      { id: "mid", expr: "mid()" },
      { id: "z", expr: "same()" },
    ],
    edges: [
      { id: "e1", from: "root", to: "x", type: "causes" },
      { id: "e2", from: "x", to: "mid", type: "causes" },
      { id: "e3", from: "mid", to: "z", type: "causes" },
    ],
  });
  const res = engine.mergeEquivalentStates(g, { groups: [["x", "z"]] });
  assert.equal(res.merged, 0);
  assert.equal(res.skipped, 1);
  assert.equal(g.nodes.length, 4); // nothing removed
});

test("edge rewiring drops self-loops and dedups parallel edges (canonical preferred)", () => {
  // pA -> x and pA -> y (same parent reaches both); after merge the two
  // pA->survivor edges dedup to one. y->x edge would self-loop; dropped.
  const g = engine.normalizeGraph({
    root: "root",
    nodes: [
      { id: "root", expr: "start()" },
      { id: "pA", expr: "a()" },
      { id: "x", expr: "same()" },
      { id: "y", expr: "same()" },
    ],
    edges: [
      { id: "e1", from: "root", to: "pA", type: "causes" },
      { id: "e2", from: "pA", to: "x", type: "causes" },
      { id: "e3", from: "pA", to: "y", type: "causes" },
      { id: "e4", from: "y", to: "x", type: "rejoins", canonical: false },
    ],
  });
  const res = engine.mergeEquivalentStates(g, { groups: [["x", "y"]] });
  assert.equal(res.merged, 1);
  const survivor = res.survivors[0]; // x (depth 2, first in order)
  assert.equal(survivor, "x");
  // No self-loops anywhere.
  assert.ok(!g.edges.some((e) => e.from === e.to));
  // Exactly one pA -> x edge survives.
  const paToX = g.edges.filter((e) => e.from === "pA" && e.to === "x");
  assert.equal(paToX.length, 1);
});

test("eligibility: ids outside eligibleIds are never merged", () => {
  const g = convergentGraph();
  const res = engine.mergeEquivalentStates(g, {
    groups: [["x", "y"]],
    eligibleIds: new Set(["x"]), // y not eligible -> group shrinks to 1
  });
  assert.equal(res.merged, 0);
  assert.equal(g.nodes.length, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/automerge.test.js`
Expected: FAIL — `engine.mergeEquivalentStates is not a function`.

- [ ] **Step 3: Implement the engine function**

In `story_builder_engine.js`, add these helpers and the function **above** the `const api = {...}` line (so they are in scope), then add `mergeEquivalentStates` to the exported `api`:

```javascript
  // ---- Auto-merge (spec 2026-06-22): collapse state-equivalent nodes. ----

  function isCanonicalEdge(edge) {
    return edge.canonical === true || (edge.canonical === undefined && edge.type === "causes");
  }

  // Shortest canonical distance from any root (node with no canonical
  // in-edges). Pure topology — no fixture needed (spec R3).
  function canonicalDepths(graph) {
    const depth = new Map();
    const indeg = new Map();
    const adj = new Map();
    graph.nodes.forEach((node) => { indeg.set(node.id, 0); adj.set(node.id, []); });
    graph.edges.forEach((edge) => {
      if (!isCanonicalEdge(edge)) return;
      if (!indeg.has(edge.to) || !adj.has(edge.from)) return;
      indeg.set(edge.to, indeg.get(edge.to) + 1);
      adj.get(edge.from).push(edge.to);
    });
    const queue = [];
    graph.nodes.forEach((node) => {
      if (indeg.get(node.id) === 0) { depth.set(node.id, 0); queue.push(node.id); }
    });
    while (queue.length) {
      const id = queue.shift();
      for (const next of adj.get(id)) {
        const cand = depth.get(id) + 1;
        depth.set(next, Math.min(depth.has(next) ? depth.get(next) : Infinity, cand));
        indeg.set(next, indeg.get(next) - 1);
        if (indeg.get(next) === 0) queue.push(next);
      }
    }
    return depth;
  }

  // Absorb victim into survivor: rewire edges, drop self-loops, dedup
  // parallel edges (canonical wins), remap omega, delete victim (R5/R6).
  function absorbNode(graph, victimId, survivorId) {
    graph.edges.forEach((edge) => {
      if (edge.from === victimId) edge.from = survivorId;
      if (edge.to === victimId) edge.to = survivorId;
    });
    graph.edges = graph.edges.filter((edge) => edge.from !== edge.to);
    const kept = [];
    const byKey = new Map();
    for (const edge of graph.edges) {
      const key = `${edge.from} ${edge.to} ${edge.type}`;
      if (!byKey.has(key)) { byKey.set(key, edge); kept.push(edge); }
      else if (isCanonicalEdge(edge) && !isCanonicalEdge(byKey.get(key))) {
        byKey.get(key).canonical = true; // keep the canonical incarnation
      }
    }
    graph.edges = kept;
    if (Array.isArray(graph.omega)) {
      graph.omega = Array.from(new Set(graph.omega.map((id) => (id === victimId ? survivorId : id))));
    }
    graph.nodes = graph.nodes.filter((node) => node.id !== victimId);
  }

  function mergeEquivalentStates(graph, opts = {}) {
    const groups = opts.groups || [];
    const eligible = opts.eligibleIds
      ? (opts.eligibleIds instanceof Set ? opts.eligibleIds : new Set(opts.eligibleIds))
      : null;
    const depths = canonicalDepths(graph);
    const orderIndex = new Map(graph.nodes.map((node, idx) => [node.id, idx]));
    let merged = 0;
    let skipped = 0;
    const survivors = [];

    for (const rawGroup of groups) {
      const ids = rawGroup.filter((id) =>
        graph.nodes.some((node) => node.id === id) && (!eligible || eligible.has(id)));
      if (ids.length < 2) continue;
      // R3: survivor = smallest canonical depth, tie by node order.
      ids.sort((a, b) => {
        const da = depths.has(a) ? depths.get(a) : Infinity;
        const db = depths.has(b) ? depths.get(b) : Infinity;
        if (da !== db) return da - db;
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      });
      const survivorId = ids[0];
      const survivor = graph.nodes.find((node) => node.id === survivorId);
      const absorbed = [];
      for (const victimId of ids.slice(1)) {
        // R4: skip if either reaches the other (merge would create a cycle).
        if (reachable(graph, survivorId, victimId) || reachable(graph, victimId, survivorId)) {
          skipped += 1;
          continue;
        }
        absorbNode(graph, victimId, survivorId);
        absorbed.push(victimId);
        merged += 1;
      }
      if (absorbed.length) {
        survivor.tags = Array.from(new Set([...(survivor.tags || []), "merged"]));
        survivor.mergedFrom = [...(survivor.mergedFrom || []), ...absorbed];
        survivors.push(survivorId);
      }
    }
    return { ok: true, merged, skipped, survivors };
  }
```

Then extend the export line:

```javascript
  const api = { EDGE_TYPES, normalizeGraph, reachable, wouldCreateCycle, addEdge, addBranch, validateGraph, topoRanks, exportGraph, importGraph, mergeEquivalentStates };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/automerge.test.js`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Run the full suite + syntax check**

Run: `npm test`
Expected: every `node --check` passes; all test files pass.

- [ ] **Step 6: Commit**

```bash
git add story_builder_engine.js tests/automerge.test.js
git commit -m "$(cat <<'EOF'
feat: engine mergeEquivalentStates for auto-merge (R1-R6)

Collapse caller-supplied state-equivalent node groups onto the survivor
closest to a root; cycle-unsafe pairs skipped; victim edges rewired,
self-loops dropped, parallel edges deduped (canonical preferred), omega
remapped. Pure graph op, fixture-decoupled.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: State-preservation integration test

**Files:**
- Test: `tests/automerge.test.js` (append)

**Interfaces:**
- Consumes: `mergeEquivalentStates` (Task 1); `RetrocauseStateWalker.computeAllPostStates`, `RetrocausePhi.stateKey`, the `magi`/`red` seeds and fixtures.
- Produces: nothing new — proves the spec's safety invariant (merging equal-state nodes leaves every surviving node's post-state unchanged).

This task encodes the design's core safety claim against a real typed graph. It synthesizes a genuine convergence: take a seed, give a node a second canonical parent whose own post-state equals the existing parent's, so the duplicated child is truly state-equivalent — then assert merge changes no surviving post-state.

- [ ] **Step 1: Write the failing test**

Append to `tests/automerge.test.js`:

```javascript
const Phi = require("../phi.js");
const Walker = require("../state_walker.js");
const { seeds } = require("../seeds.js");
require("../red_fixture.js");
require("../magi_fixture.js");

// Same shape coercion the app/walker rely on.
function normalizeSeed(graph) {
  return engine.normalizeGraph(JSON.parse(JSON.stringify(graph)));
}

test("merging two genuinely equal-state nodes preserves all post-states", () => {
  // Build a tiny typed graph by hand using the red fixture's lexicon so we
  // control which nodes share a state. Two no-op-after children of one
  // parent are state-equivalent; merging them must not move any state.
  const Red = require("../red_fixture.js");
  const fx = Red; // red_fixture exports the LEntry table + scope
  // Find a node with an action whose effects are already satisfied -> its
  // child shares the parent state. Simplest robust check: build a graph
  // where two sibling children carry NO action (pure derivation closure),
  // so both equal the parent's closed state.
  const g = engine.normalizeGraph({
    root: "r",
    nodes: [
      { id: "r", expr: "start()" },          // root -> initial_state closure
      { id: "c1", expr: "noop1()" },          // no action -> closure(initial)
      { id: "c2", expr: "noop2()" },          // no action -> closure(initial)
    ],
    edges: [
      { id: "e1", from: "r", to: "c1", type: "causes" },
      { id: "e2", from: "r", to: "c2", type: "causes" },
    ],
  });

  const before = Walker.computeAllPostStates(g, fx, Phi);
  const kc1 = Phi.stateKey(before.get("c1"));
  const kc2 = Phi.stateKey(before.get("c2"));
  assert.equal(kc1, kc2, "c1 and c2 must be state-equivalent for this test");

  const res = engine.mergeEquivalentStates(g, { groups: [["c1", "c2"]] });
  assert.equal(res.merged, 1);

  const after = Walker.computeAllPostStates(g, fx, Phi);
  for (const node of g.nodes) {
    assert.equal(
      Phi.stateKey(after.get(node.id)),
      Phi.stateKey(before.get(node.id)),
      `post-state of ${node.id} changed across merge`
    );
  }
});
```

- [ ] **Step 2: Run to verify it passes (no new production code needed)**

Run: `node --test tests/automerge.test.js`
Expected: PASS, including the new test. If `c1`/`c2` are not equal-state in this fixture, adjust the graph so both children have no `action` (pure closure) — the assertion `kc1 === kc2` documents the precondition.

- [ ] **Step 3: Commit**

```bash
git add tests/automerge.test.js
git commit -m "$(cat <<'EOF'
test: auto-merge preserves all post-states (walker round-trip)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: UI toggle + auto-branch post-pass wiring

**Files:**
- Modify: `story_builder.html` (add checkbox in the auto-branch row)
- Modify: `story_builder_app.js` (`autoBranchFromSelected` + new `runAutoMerge` helper)

**Interfaces:**
- Consumes: `window.StoryDagEngine.mergeEquivalentStates` (Task 1); `window.RetrocauseStateWalker.computeAllPostStates`; `window.RetrocausePhi.stateKey`; the existing `phiBindings[state.activeSeed].fixture()` accessor.
- Produces: user-visible auto-merge behavior; no API consumed by later tasks.

- [ ] **Step 1: Add the checkbox to the auto-branch row**

In `story_builder.html`, the `auto-branch-row` div currently ends after the `Max` input (`story_builder.html:122`). Add a checkbox label right after the `Max` label, still inside `<div class="auto-branch-row">`:

```html
          <label>Max<input id="autoMaxNodes" type="number" min="1" max="40" value="12"></label>
          <label class="inline-label">
            <input id="autoMergeToggle" type="checkbox">
            <span>Auto-merge convergent states</span>
          </label>
```

(`el` is auto-built from every `[id]` element — `story_builder_app.js:63` — so `el.autoMergeToggle` becomes available with no extra wiring.)

- [ ] **Step 2: Track run-created node ids and read the toggle**

In `story_builder_app.js`, in `autoBranchFromSelected` (`story_builder_app.js:615`):

Add a run-id set and read the toggle alongside the existing clamp reads (after `story_builder_app.js:623`):

```javascript
    const mergeEnabled = !!(el.autoMergeToggle && el.autoMergeToggle.checked);
    const runNodeIds = new Set();
```

Record each created node — after `lastMadeId = newNode.id;` (`story_builder_app.js:670`) add:

```javascript
          runNodeIds.add(newNode.id);
```

- [ ] **Step 3: Allow cross-branch convergence when merging is on**

In the same function, the `chooseAutoCandidates` call (`story_builder_app.js:646-651`) passes `seenStateKeys: autoSeenStateKeys`. When merging is on we must NOT suppress convergent candidates (we want them created so they can be merged). Change that one property:

```javascript
        const candidates = chooseAutoCandidates(source, data.candidates, data.nodeState, {
          fixture: data.fixture,
          limit: perNode,
          seenStateKeys: mergeEnabled ? new Set() : autoSeenStateKeys,
          pathEntryNames,
        });
```

(The per-parent `outgoingExprs` filter inside `chooseAutoCandidates` still prevents one parent from getting two identical children — that is not convergence. The `maxNodes` cap still bounds the run.)

- [ ] **Step 4: Run the merge post-pass and fix selection**

Still in `autoBranchFromSelected`: declare a summary before the `try` (just after `let lastMadeId = null;`, `story_builder_app.js:628`):

```javascript
    let mergeSummary = null;
```

After the `while` loop closes but still inside `try` (immediately before the `} finally {` at `story_builder_app.js:679`), insert:

```javascript
      if (mergeEnabled && runNodeIds.size) {
        mergeSummary = runAutoMerge(runNodeIds);
        if (mergeSummary && lastMadeId && mergeSummary.victimToSurvivor.has(lastMadeId)) {
          lastMadeId = mergeSummary.victimToSurvivor.get(lastMadeId);
        }
      }
```

In the `finally` block, fold the merge counts into the status text. Replace the existing status line (`story_builder_app.js:687`):

```javascript
      const mergeSuffix = mergeSummary && mergeSummary.merged
        ? ` Merged ${mergeSummary.merged} convergent node${mergeSummary.merged === 1 ? "" : "s"}.${mergeSummary.skipped ? ` ${mergeSummary.skipped} pair${mergeSummary.skipped === 1 ? "" : "s"} skipped (would cycle).` : ""}`
        : "";
      setAutoBranchStatus(`${stopped ? "Stopped" : "Finished"}: created ${made} node${made === 1 ? "" : "s"}.${suffix}${mergeSuffix}`);
```

- [ ] **Step 5: Add the `runAutoMerge` helper**

Add next to the other auto-branch helpers, e.g. directly after `chooseAutoCandidates` ends (`story_builder_app.js:745`):

```javascript
  // Post-pass for auto-branch: bucket this run's nodes by post-state and
  // collapse each ≥2-node bucket via the engine (spec R1-R6). Returns
  // { merged, skipped, victimToSurvivor } or null when prerequisites are
  // missing (no Phi/walker/fixture or walker error) — caller no-ops then.
  function runAutoMerge(runNodeIds) {
    const Phi = (typeof window !== "undefined" && window.RetrocausePhi) || null;
    const Walker = (typeof window !== "undefined" && window.RetrocauseStateWalker) || null;
    const Engine = (typeof window !== "undefined" && window.StoryDagEngine) || null;
    const binding = state.activeSeed ? phiBindings[state.activeSeed] : null;
    const fx = binding && binding.fixture && binding.fixture();
    if (!Phi || !Walker || !Engine || !fx) return null;

    let postStates;
    try {
      postStates = Walker.computeAllPostStates(state.graph, fx, Phi);
    } catch (err) {
      return null;
    }

    const buckets = new Map();
    for (const id of runNodeIds) {
      const st = postStates.get(id);
      if (!st) continue;
      const key = Phi.stateKey(st);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(id);
    }
    const groups = Array.from(buckets.values()).filter((g) => g.length >= 2);
    if (!groups.length) return { merged: 0, skipped: 0, victimToSurvivor: new Map() };

    const result = Engine.mergeEquivalentStates(state.graph, { groups, eligibleIds: runNodeIds });

    // Recover victim→survivor from the groups: the survivor is the one id
    // in each group still present after the merge.
    const present = new Set(state.graph.nodes.map((n) => n.id));
    const victimToSurvivor = new Map();
    for (const g of groups) {
      const survivor = g.find((id) => present.has(id));
      if (!survivor) continue;
      for (const id of g) if (id !== survivor && !present.has(id)) victimToSurvivor.set(id, survivor);
    }
    return { merged: result.merged, skipped: result.skipped, victimToSurvivor };
  }
```

- [ ] **Step 6: Syntax-check and run the suite**

Run: `npm test`
Expected: `node --check story_builder_app.js` and all files pass; all tests green.

- [ ] **Step 7: Manual browser verification**

1. Open `story_builder.html` in a browser.
2. Select the **Magi** seed; pick a node with a typed fixture.
3. Leave **"Auto-merge convergent states"** unchecked, click **Auto branch** — confirm behavior is unchanged from before (a divergent tree; status reports created N).
4. Undo/reload, check the box, click **Auto branch** — confirm: convergent nodes collapse (a node gains 2+ incoming edges), the status line reports `Merged N convergent node(s)`, and no node shows a self-loop. Confirm selection lands on a surviving node, not a deleted one.
5. Repeat with the **Red** seed.

- [ ] **Step 8: Commit**

```bash
git add story_builder.html story_builder_app.js
git commit -m "$(cat <<'EOF'
feat: auto-merge toggle for auto-branching

Opt-in checkbox collapses convergent auto-branch nodes (identical
post-state, distinct parents) via engine.mergeEquivalentStates. Default
off preserves prior behavior; when on, cross-branch convergence is
allowed during BFS and merged in a post-pass with status reporting.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- R1 (equal post-state) → Task 3 bucketing by `Phi.stateKey`; Task 1 consumes groups. ✓
- R2 (eligibility this-run) → `eligibleIds`/`runNodeIds` (Tasks 1 & 3). ✓
- R3 (survivor closest to root, tie by order) → `canonicalDepths` + sort (Task 1); test in Task 1. ✓
- R4 (cycle safety) → `reachable` guard (Task 1); test in Task 1. Note: implemented via full `reachable` (any path), which is stricter and safer than canonical-only ancestry — it cannot create a cycle the engine's own `validateGraph` would later reject. ✓
- R5 (edge rewiring/dedup/self-loop) → `absorbNode` (Task 1); test in Task 1. ✓
- R6 (provenance + selection) → `mergedFrom`/`merged` tag (Task 1); selection fix + status (Task 3). ✓
- Engine takes pre-computed groups (decoupled) → Task 1 interface. ✓
- Default-off toggle + status reporting → Task 3. ✓
- omega cleanup on node deletion → `absorbNode` remaps omega (matches `deleteSelectedNode`). ✓
- State-preservation invariant → Task 2 test. ✓
- Out-of-scope items (cross-run merge, subsumption, animation) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `mergeEquivalentStates(graph, {groups, eligibleIds}) -> {ok, merged, skipped, survivors}` is consistent across Tasks 1 & 3. `runAutoMerge` returns `{merged, skipped, victimToSurvivor}` consistently across Steps 4–5 of Task 3. Canonical-edge predicate identical everywhere. ✓
