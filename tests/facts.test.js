// facts.js: parsing, folding and comparing worlds.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const Facts = require("../facts.js");
const { seeds } = require("../seeds.js");

test("parseEffects normalizes case, spaces and a leading article, and rejects non-facts", () => {
  const { pairs, rejected } = Facts.parseEffects("Red.Location = the dark woods; wolf.knows_destination=YES, Red is sad, =x");
  assert.deepStrictEqual(pairs, [["red.location", "dark_woods"], ["wolf.knows_destination", "yes"]]);
  assert.strictEqual(rejected, 2);
  assert.strictEqual(Facts.formatEffects(pairs), "red.location=dark_woods, wolf.knows_destination=yes");
});

test("fold is last-write-wins, and worldKey ignores the order facts were written in", () => {
  const a = Facts.fold(new Map(), [["red.location", "home"], ["red.location", "woods"], ["wolf.alive", "yes"]]);
  const b = Facts.fold(new Map([["wolf.alive", "yes"]]), [["red.location", "woods"]]);
  assert.strictEqual(a.get("red.location"), "woods");
  assert.strictEqual(Facts.worldKey(a), Facts.worldKey(b));
});

test("worldDiff names each differing fact, one held by only one side included", () => {
  const a = new Map([["x.p", "1"], ["x.q", "2"]]);
  const b = new Map([["x.p", "1"], ["x.q", "3"], ["y.r", "4"]]);
  assert.deepStrictEqual(Facts.worldDiff(a, b), [{ key: "x.q", a: "2", b: "3" }, { key: "y.r", a: undefined, b: "4" }]);
});

test("renderWorld groups by owner", () => {
  const world = new Map([["wolf.alive", "yes"], ["red.location", "woods"], ["red.has_basket", "yes"]]);
  assert.strictEqual(Facts.renderWorld(world), "red: has_basket=yes, location=woods\nwolf: alive=yes");
});

test("worldsOf folds a seed along its path, and the seeds' worlds are almost all distinct", () => {
  const red = seeds.red;
  const worlds = Facts.worldsOf(red);
  assert.strictEqual(worlds.get(red.root).get("red.location"), "home");
  const last = red.nodes.at(-1).id;
  assert.strictEqual(worlds.get(last).get("wolf.alive"), "no");
  for (const [name, graph] of Object.entries(seeds)) {
    const w = Facts.worldsOf(graph);
    const keys = new Set(graph.nodes.map((n) => Facts.worldKey(w.get(n.id))));
    // criedWolf's second arrival folds to the world after the first laugh: a
    // recurrence the fact layer cannot tell apart (they are on one route).
    assert.ok(keys.size >= graph.nodes.length - 1, name);
  }
});

test("worldsOf takes a merged node's world through its main parent, not a rejoin", () => {
  const graph = {
    root: "r",
    nodes: [
      { id: "r", effects: "a.x=1" },
      { id: "b", effects: "a.y=2" },
      { id: "c", effects: "a.y=3" },
      { id: "d", effects: "a.z=4" },
    ],
    edges: [
      { from: "r", to: "b", type: "causes" },
      { from: "r", to: "c", type: "causes" },
      { from: "b", to: "d", type: "choice" },
      { from: "c", to: "d", type: "rejoins" },
    ],
  };
  assert.strictEqual(Facts.worldKey(Facts.worldsOf(graph).get("d")), "a.x=1;a.y=2;a.z=4");
});

test("parseEffects drops keys that name the event instead of a state", () => {
  const { pairs, rejected } = Facts.parseEffects("wolf.action=wait, red.state=happy, wolf.location=house");
  assert.deepStrictEqual(pairs, [["wolf.location", "house"]]);
  assert.strictEqual(rejected, 2);
});

test("vocabularyOf lists the authored nodes' keys, not the grown ones", () => {
  const graph = { nodes: [
    { id: "a", effects: "red.location=home, wolf.alive=yes" },
    { id: "b", effects: "red.location=woods" },
    { id: "g", createdBy: "grown", effects: "red.mood=glad" },
  ], edges: [] };
  assert.deepStrictEqual(Facts.vocabularyOf(graph), ["red.location", "wolf.alive"]);
});
