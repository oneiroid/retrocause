// tools/eval.js — metric scoring and the probe baseline (LOCAL_LLM.md §6).
// Model-free like every other test: the baseline is a lexicon recombiner and
// scoring is pure graph arithmetic; nothing here touches a server.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const Ids = require("../ids.js");
const { scoreGrowth, evalRun } = require("../tools/eval.js");

// A hand-built scored graph: root → two grown children (one expr repeated
// via a second grown node), one valid rejoin, one contradiction.
function syntheticGraph() {
  return {
    nodes: [
      { id: "root", expr: "start()", createdBy: "seed" },
      { id: "seed_end", expr: "end()", createdBy: "seed" },
      {
        id: "g1", expr: "flee(red)", createdBy: "grown",
        delta: "red runs", invariants: "the wolf is hungry",
      },
      {
        id: "g2", expr: "hide(red)", createdBy: "grown",
        // The observed Phase 0.5 failure: delta copied into invariants.
        delta: "Red hides", invariants: "red  hides",
      },
      { id: "g3", expr: "flee(red)", createdBy: "grown", delta: "", invariants: "" },
    ],
    edges: [
      { id: "e1", from: "root", to: "g1", type: "choice" },
      { id: "e2", from: "root", to: "g2", type: "choice" },
      { id: "e3", from: "g1", to: "g3", type: "choice" },
      { id: "e4", from: "g2", to: "seed_end", type: "rejoins", branchId: "g2" },
    ],
  };
}

const STATS = {
  created: 3, mergedDuplicates: 1, rejectedCycles: 1,
  truncated: 1, droppedRejoins: 1, expansions: 3,
};

test("scoreGrowth computes the §6 metric table from graph + counters", () => {
  const s = scoreGrowth({ graph: syntheticGraph(), stats: STATS });
  assert.strictEqual(s.grownNodes, 3);
  assert.strictEqual(s.jsonValidity, 3 / 4);                 // 1 truncated of 4 requests
  assert.strictEqual(s.acyclicityAcceptance, 4 / 5);         // 1 cycle of 5 inserts
  assert.strictEqual(s.dupExprRate, 1 - 2 / 3);              // flee(red) appears twice
  assert.strictEqual(s.mergeRate, 1 / 5);
  assert.strictEqual(s.rejoinValidity, 1 / 2);               // 1 kept, 1 dropped
  // root's grown children are distinct; g1's single child is trivially so.
  assert.strictEqual(s.branchDiversity, 1);
  assert.deepStrictEqual(s.histogram, { 0: 1, 1: 4 });
});

test("the contradiction check flags delta==invariants only when non-empty", () => {
  const s = scoreGrowth({ graph: syntheticGraph(), stats: STATS });
  // g2 (normalized copy) counts; g3 (both empty) is absence, not agreement.
  assert.strictEqual(s.contradictionRate, 1 / 3);
  assert.deepStrictEqual(s.contradictions.map((c) => c.id), ["g2"]);
});

test("the baseline replays byte-identically through the grower", async () => {
  const row = await evalRun({
    source: "baseline", story: "red", depth: 2, width: 2, maxNodes: 8, seed: 7, replay: true,
  });
  assert.strictEqual(row.replayOk, true);
  assert.ok(row.grownNodes > 0);
  assert.strictEqual(row.jsonValidity, 1);
});

test("baseline runs are isolated across stories (candidate-cache clearing)", async () => {
  const cfg = { source: "baseline", depth: 2, width: 2, maxNodes: 8, seed: 7, replay: false };
  // criedWolf grown fresh vs grown right after a red run must be identical —
  // the probe's candidate cache does not key on the inducing graph, and the
  // stories share exprs by design.
  const fresh = await evalRun({ ...cfg, story: "criedWolf" });
  await evalRun({ ...cfg, story: "red" });
  const after = await evalRun({ ...cfg, story: "criedWolf" });
  assert.strictEqual(Ids.canonicalJson(after.graph), Ids.canonicalJson(fresh.graph));
});
