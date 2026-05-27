// Tests for state_walker.js. Cross-checks the generic walker against
// the hand-rolled post-state functions in red_fixture.js / magi_fixture.js
// — if these agree, the walker is a faithful generalization of the
// per-seed replay tables it replaces (M1 exit criterion).

const test = require("node:test");
const assert = require("node:assert/strict");

const Phi = require("../phi.js");
const Walker = require("../state_walker.js");
const { seeds } = require("../seeds.js");
const Red = require("../red_fixture.js");
const Magi = require("../magi_fixture.js");

function normalize(graph) {
  // Same shape coercion story_builder_app.normalizeGraph performs; needed
  // because the walker uses the `canonical` flag and `action` annotations
  // as-authored in seeds.js.
  return {
    ...graph,
    nodes: graph.nodes.map(n => ({ kind: "canonical", tags: [], ...n })),
    edges: graph.edges.map(e => ({
      canonical: e.canonical ?? e.type === "causes",
      ...e,
    })),
  };
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// -------- red walker matches hand-coded postStateAtRedWolf --------

test("walker(red, red_wolf) equals Red.postStateAtRedWolf()", () => {
  const graph = normalize(seeds.red);
  const all = Walker.computeAllPostStates(graph, Red, Phi);
  const expected = Red.postStateAtRedWolf();
  const actual = all.get("red_wolf");
  assert.ok(actual, "walker produced a post-state at red_wolf");
  assert.equal(setsEqual(actual, expected), true,
    `red_wolf state mismatch. expected size=${expected.size}, actual size=${actual.size}`);
});

test("walker(red) intermediate states agree with hand-coded replay", () => {
  const graph = normalize(seeds.red);
  const all = Walker.computeAllPostStates(graph, Red, Phi);
  const s = Red.scope.initial_state;
  const s1 = Phi.step(s, Red.entries.give, { Giver: "mother", Receiver: "red", Item: "basket" }, []);
  const s2 = Phi.step(s1, Red.entries.move, { X: "red", From: "home", To: "woods" }, []);
  assert.equal(setsEqual(all.get("red_start"), s1), true, "red_start matches give() result");
  assert.equal(setsEqual(all.get("red_woods"), s2), true, "red_woods matches move() result");
});

// -------- magi walker matches the four hand-coded post-states --------

test("walker(magi, magi_start) equals Magi.postStateAfterMagiStart()", () => {
  const graph = normalize(seeds.magi);
  const all = Walker.computeAllPostStates(graph, Magi, Phi);
  assert.equal(setsEqual(all.get("magi_start"), Magi.postStateAfterMagiStart()), true);
});

test("walker(magi, magi_buy_chain) equals Magi.postStateDellaChainEnd()", () => {
  const graph = normalize(seeds.magi);
  const all = Walker.computeAllPostStates(graph, Magi, Phi);
  // della's chain end in the walker is *after* magi_start applied realize();
  // hand-coded postStateDellaChainEnd does the same internally.
  assert.equal(setsEqual(all.get("magi_buy_chain"), Magi.postStateDellaChainEnd()), true);
});

test("walker(magi, magi_jim_combs) equals Magi.postStateJimChainEnd() after re-baseline", () => {
  // postStateJimChainEnd starts from initial_state (skipping della's
  // realize) — see the fixture's comment. The walker, by contrast,
  // applies realize() at magi_start before branching, so jim's chain
  // inherits knows(della, not_has_funds(della)). The two states differ
  // only by that extra knows-fact. We assert the walker is a superset
  // and that all hand-coded facts are present.
  const graph = normalize(seeds.magi);
  const all = Walker.computeAllPostStates(graph, Magi, Phi);
  const actual = all.get("magi_jim_combs");
  const expected = Magi.postStateJimChainEnd();
  for (const fact of expected) {
    assert.ok(actual.has(fact), `walker missing fact at magi_jim_combs: ${fact}`);
  }
  assert.ok(actual.has("knows(della,not_has_funds(della))"),
    "walker should carry della's realize-derived knowledge into jim's parallel branch (M1 semantic divergence from per-chain hand-replay)");
});

test("walker(magi, magi_reveal) fires useless_pairing symmetrically (C.4-1)", () => {
  const graph = normalize(seeds.magi);
  const all = Walker.computeAllPostStates(graph, Magi, Phi);
  const s = all.get("magi_reveal");
  assert.ok(s, "walker produced a post-state at magi_reveal");
  assert.equal(s.has("useless(watch_chain,sacrificed(jim,watch))"), true,
    "watch_chain is useless because jim sacrificed the watch");
  assert.equal(s.has("useless(combs,sacrificed(della,hair))"), true,
    "combs are useless because della sacrificed the hair");
  assert.equal(s.has("sacrificed(della,hair)"), true);
  assert.equal(s.has("sacrificed(jim,watch)"), true);
});

// -------- structural checks --------

test("walker reaches every node in the canonical sub-DAG of red", () => {
  const graph = normalize(seeds.red);
  const order = Walker.topoOrderCanonical(graph);
  assert.equal(order.length, graph.nodes.length,
    "topo order must include every node (including branch / off-canonical nodes)");
  assert.equal(order[0], "red_start", "root sorts first");
});

test("walker detects cycles in the canonical sub-DAG", () => {
  const cyclic = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { from: "a", to: "b", type: "causes", canonical: true },
      { from: "b", to: "a", type: "causes", canonical: true },
    ],
  };
  assert.throws(() => Walker.topoOrderCanonical(cyclic), /cycle/);
});
