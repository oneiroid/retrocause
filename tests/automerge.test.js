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

test("omega remap (R5): victim ids in omega are remapped to survivor and deduped", () => {
  // Two equal-state nodes x and y off distinct parents; omega references both.
  // After merge: omega should contain only the survivor id once.
  const g = engine.normalizeGraph({
    root: "root",
    meta: { title: "omega-remap fixture", version: 2 },
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
  g.omega = ["y", "x"]; // both victims listed; y comes first but x is the survivor (same depth, earlier order)
  const res = engine.mergeEquivalentStates(g, { groups: [["x", "y"]] });
  assert.equal(res.merged, 1);
  // x has canonical depth 2, y has canonical depth 2; x is first in node order -> x survives.
  const survivorId = res.survivors[0];
  assert.equal(survivorId, "x");
  // omega should now contain only the survivor id, no duplicates.
  assert.deepEqual(g.omega, ["x"]);
});

test("multi-victim group (>=3): three equal-state nodes collapse to one survivor", () => {
  // Three equal-state nodes x, y, z each hanging off distinct parents at the same canonical depth.
  const g = engine.normalizeGraph({
    root: "root",
    meta: { title: "multi-victim fixture", version: 2 },
    nodes: [
      { id: "root", label: "root", expr: "start()" },
      { id: "pA", label: "A", expr: "a()", createdBy: "phi-auto" },
      { id: "pB", label: "B", expr: "b()", createdBy: "phi-auto" },
      { id: "pC", label: "C", expr: "c()", createdBy: "phi-auto" },
      { id: "x", label: "X", expr: "same()", createdBy: "phi-auto" },
      { id: "y", label: "Y", expr: "same()", createdBy: "phi-auto" },
      { id: "z", label: "Z", expr: "same()", createdBy: "phi-auto" },
    ],
    edges: [
      { id: "e1", from: "root", to: "pA", type: "causes" },
      { id: "e2", from: "root", to: "pB", type: "causes" },
      { id: "e3", from: "root", to: "pC", type: "causes" },
      { id: "e4", from: "pA", to: "x", type: "causes" },
      { id: "e5", from: "pB", to: "y", type: "causes" },
      { id: "e6", from: "pC", to: "z", type: "causes" },
    ],
  });
  const res = engine.mergeEquivalentStates(g, { groups: [["x", "y", "z"]] });
  // Two victims (y and z) absorbed into survivor (x).
  assert.equal(res.merged, 2);
  // Exactly one of x/y/z survives in the graph.
  const ids = g.nodes.map((n) => n.id);
  assert.ok(ids.includes("x"), "x must survive (earliest node order at equal depth)");
  assert.ok(!ids.includes("y"), "y must be removed");
  assert.ok(!ids.includes("z"), "z must be removed");
  // survivors list has exactly one entry (no duplicates even though one survivor absorbed multiple victims).
  assert.equal(res.survivors.length, 1);
  assert.equal(res.survivors[0], "x");
  // mergedFrom records both victims.
  const survivorNode = g.nodes.find((n) => n.id === "x");
  assert.equal(survivorNode.mergedFrom.length, 2);
  // Survivor has 3 incoming canonical edges: from pA, pB, pC.
  const inEdges = canonicalIn(g, "x").map((e) => e.from).sort();
  assert.deepEqual(inEdges, ["pA", "pB", "pC"]);
});

// -------- Task 2: state-preservation integration test --------

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
