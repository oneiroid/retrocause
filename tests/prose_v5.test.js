// branch.v5 (prose + formalization) and the told-story match. Model-free:
// the growth client and the formalizer's client are stubs.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require("../story_builder_engine.js");
const {
  growGraph, renderPrompt, promptContext, formatForPrompt, parseParagraph, toldMatch,
} = require("../grower.js");
const { seeds } = require("../seeds.js");

const TEMPLATE = fs.readFileSync(path.join(__dirname, "..", "prompts", "branch.v5.txt"), "utf8");

test("v5 prompt: the story itself as prose — no example story, no JSON, no reading", () => {
  const graph = Engine.normalizeGraph(seeds.criedWolf);
  const source = graph.nodes.find((n) => n.id === "cw_cry2");
  const prompt = renderPrompt(TEMPLATE, promptContext(graph, source));
  assert.ok(prompt.startsWith("The Boy Who Cried Wolf\n\nThe characters are the boy, the villagers and the wolf.\n\n"));
  assert.ok(prompt.endsWith("The boy cries wolf again. The boy is shouting about a wolf a second time. The alarm is a lie again.\n\n"));
  assert.ok(!/Tortoise|\{|"action"/.test(prompt));
  assert.ok(!prompt.includes(source.reading));
  assert.ok(!prompt.includes("They come a second time"), "the told future must not be visible");
});

test("v5 parse: first sentence is the label, the rest the state", () => {
  assert.deepStrictEqual(
    parseParagraph("The villagers stay home. Nobody comes. The boy is alone.\n"),
    { label: "The villagers stay home", state: "Nobody comes. The boy is alone." },
  );
});

test("v5 grow: the paragraph becomes a node, its expr comes from the formalizer in the story's vocabulary", async () => {
  const formalPrompts = [];
  const formalClient = { complete: async (prompt, schema, { grammar }) => {
    formalPrompts.push({ prompt, grammar });
    return { content: " ignore(villagers, boy)" };
  } };
  const growth = { sampling: { seed: 7 }, complete: async () => ({ content: "The villagers stay home. Nobody comes to the hillside.\n" }) };
  const { graph, stats, trace } = await growGraph({
    graph: seeds.criedWolf, client: growth, promptTemplate: TEMPLATE,
    format: formatForPrompt("branch.v5", { formalClient }),
    from: "cw_cry2", depth: 1, width: 1, maxNodes: 2,
    // The surface key would merge this into cw_dismiss (step 10, wolf
    // present); a judge that says "different" keeps it as a new node.
    judge: async () => ({ pYes: 0.1, same: false, orders: [] }),
  });
  const grown = graph.nodes.find((n) => n.createdBy === "grown");
  assert.deepStrictEqual([grown.label, grown.expr, grown.state], ["The villagers stay home", "ignore(villagers, boy)", "Nobody comes to the hillside."]);
  const [{ prompt, grammar }] = formalPrompts;
  assert.ok(prompt.includes("The boy cries wolf for fun => cry(boy, wolf)"));
  assert.ok(prompt.endsWith("The villagers stay home =>"));
  assert.match(grammar, /^root ::= " " word "\("/);
  // A later told event (cw_dismiss), not the told next one.
  assert.deepStrictEqual([stats.toldNext, stats.toldLater, stats.draws], [0, 1, 1]);
  assert.deepStrictEqual(trace[0].draws[0].told, { kind: "later", id: "cw_dismiss" });
  assert.strictEqual(trace[0].draws[0].expr, "ignore(villagers, boy)");
});

test("v5 without a formalizer client fails loudly", () => {
  assert.throws(() => formatForPrompt("branch.v5"), /formalClient/);
});

test("toldMatch: next, later, or new — told nodes only, reachable from the source only", () => {
  const graph = Engine.normalizeGraph(seeds.criedWolf);
  assert.deepStrictEqual(toldMatch(graph, "cw_cry2", "arrive(villagers, flock)"), { kind: "next", id: "cw_run2" });
  assert.deepStrictEqual(toldMatch(graph, "cw_cry2", "ignore(villagers, boy)"), { kind: "later", id: "cw_dismiss" });
  assert.strictEqual(toldMatch(graph, "cw_cry2", "fly(boy, moon)"), null);
  // cw_watch's expr is behind the source, never a match.
  assert.strictEqual(toldMatch(graph, "cw_cry2", "send(villagers, boy, flock)"), null);
});
