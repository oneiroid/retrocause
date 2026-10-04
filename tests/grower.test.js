// grower.js — full grower against checked-in fixtures (LOCAL_LLM.md §7).
// The real llm_client runs over a stub transport that serves recorded
// responses from tests/fixtures/branch_responses.json, so the entire growth
// loop executes with no llama.cpp, no network, no new dependencies.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Ids = require("../ids.js");
const Engine = require("../story_builder_engine.js");
const { createClient } = require("../llm_client.js");
const {
  growGraph, renderPrompt, promptContext, ancestorPath, formatForPrompt, drawSeed, nextStepGrammar, stepLine,
} = require("../grower.js");
const { seeds } = require("../seeds.js");

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "branch_responses.json"), "utf8"),
);
const TEMPLATE = fs.readFileSync(path.join(__dirname, "..", "prompts", "branch.v4.txt"), "utf8");

// The source's action is the LAST `"action"` of the rendered prompt (the
// example story contributes earlier ones).
const lastAction = (prompt) => [...prompt.matchAll(/"action": "([^"]*)"/g)].at(-1)[1];

// A completion as the server returns it: the line the grammar would admit.
const reply = (content, stopType = "eos") => ({
  ok: true, json: async () => ({ content, stop_type: stopType, stopped_limit: null }),
});

// Serves each source's fixture lines in draw order. A source with no entry
// is a fixture gap and fails the request, rather than growing a short graph.
function fixtureFetch() {
  const drawn = {};
  return async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    const expr = lastAction(JSON.parse(options.body).prompt);
    const lines = FIXTURES.completions[expr];
    if (!lines) return { ok: false, status: 500 };
    drawn[expr] = (drawn[expr] ?? -1) + 1;
    const line = lines[drawn[expr] % lines.length];
    return reply(stepLine(0, { label: line.event, expr: line.action, state: line.state }));
  };
}

function client() {
  return createClient({ fetch: fixtureFetch() });
}

const CONFIG = {
  promptTemplate: TEMPLATE,
  from: "red_start",
  depth: 2,
  width: 2,
  maxNodes: 24,
  runId: "run_test",
};

// ── the prompt ──────────────────────────────────────────────────────────────

test("v4 prompt: ends on the source's step line, shows no told future, asks for nothing", () => {
  const graph = Engine.normalizeGraph(seeds.red);
  const source = graph.nodes.find((n) => n.id === "red_tell");
  const rendered = renderPrompt(TEMPLATE, promptContext(graph, source));
  const tail = rendered.split("==> stories/little_red_riding_hood.jsonl <==\n")[1];
  const lines = tail.trimEnd().split("\n");
  assert.deepStrictEqual(JSON.parse(lines[0]), { title: seeds.red.title, characters: seeds.red.entities });
  assert.strictEqual(lines.length, 1 + ancestorPath(graph, "red_tell").length);
  for (const line of lines) JSON.parse(line);
  assert.strictEqual(JSON.parse(lines.at(-1)).action, "tell(red, wolf, grandmother_house)");
  assert.ok(rendered.endsWith(`${lines.at(-1)}\n`));
  assert.ok(!rendered.includes("leave(red, path)"), "the told next event must not be visible");
  assert.ok(!/alternative|instead|list/i.test(rendered));
});

test("v6 prompt: v4's file without the example story; at the root, one line and no example", () => {
  const v6 = fs.readFileSync(path.join(__dirname, "..", "prompts", "branch.v6.txt"), "utf8");
  const graph = Engine.normalizeGraph(seeds.red);
  const mid = renderPrompt(v6, promptContext(graph, graph.nodes.find((n) => n.id === "red_tell")));
  assert.ok(mid.startsWith("==> stories/little_red_riding_hood.jsonl <==\n"));
  assert.ok(!/Tortoise|hare/.test(mid));
  assert.strictEqual(mid.trimEnd().split("\n").length, 2 + ancestorPath(graph, "red_tell").length);
  const root = renderPrompt(v6, promptContext(graph, graph.nodes.find((n) => n.id === "red_start")));
  assert.strictEqual(root.trimEnd().split("\n").length, 3); // file line, header, the root's own step
  assert.deepStrictEqual(formatForPrompt("branch.v6").constrain(graph, graph.nodes[0]), formatForPrompt("branch.v4").constrain(graph, graph.nodes[0]));
});

test("v4 grammar: the step number is the next one; action is verb(args)", () => {
  const graph = Engine.normalizeGraph(seeds.red);
  const source = graph.nodes.find((n) => n.id === "red_tell");
  const grammar = nextStepGrammar(graph, source);
  assert.ok(grammar.includes('root ::= "{\\"step\\": 6, \\"event\\": \\""'), grammar);
  assert.match(grammar, /^action ::= word "\(" word \(", " word\)\* "\)"$/m);
  assert.deepStrictEqual(formatForPrompt("branch.v4").constrain(graph, source), { grammar });
});

test("prompt: `reading` never reaches the model; the path is one line per step", () => {
  const graph = Engine.normalizeGraph(seeds.red);
  const target = graph.nodes.find((n) => n.id === "red_flowers");
  const rendered = renderPrompt(TEMPLATE, promptContext(graph, target));
  assert.ok(target.reading);
  assert.ok(!rendered.includes(target.reading));
  assert.strictEqual(lastAction(rendered), "gather(red, flowers)");
  assert.ok(!rendered.includes("{{"));
});

test("the ancestor path is pinned when several paths reach a node", () => {
  // A diamond: two shortest root→d paths. The pinned choice is the
  // lexicographically-first one, not whichever edge order happens to yield.
  const diamond = {
    root: "a",
    nodes: ["a", "b_second", "b_first", "d"].map((id) => ({ id, expr: id, label: id })),
    edges: [
      { from: "a", to: "b_second" }, { from: "a", to: "b_first" },
      { from: "b_second", to: "d" }, { from: "b_first", to: "d" },
    ],
  };
  const graph = require("../story_builder_engine.js").normalizeGraph(diamond);
  assert.deepStrictEqual(ancestorPath(graph, "d"), ["a", "b_first", "d"]);

  const reversed = require("../story_builder_engine.js").normalizeGraph({
    ...diamond, edges: [...diamond.edges].reverse(),
  });
  assert.deepStrictEqual(ancestorPath(reversed, "d"), ["a", "b_first", "d"]);
});

test("unknown prompt versions fail loudly", () => {
  assert.throws(() => formatForPrompt("branch.v3"), /no format/);
});

// ── the traversal ───────────────────────────────────────────────────────────

test("each expansion draws `width` completions, each with its own derived seed", async () => {
  const bodies = [];
  const inner = fixtureFetch();
  const recording = async (url, options) => {
    if (!url.endsWith("/props")) bodies.push(JSON.parse(options.body));
    return inner(url, options);
  };
  await growGraph({ ...CONFIG, graph: seeds.red, depth: 1, client: createClient({ fetch: recording, sampling: { seed: 7 } }) });
  assert.strictEqual(bodies.length, CONFIG.width);
  assert.deepStrictEqual(bodies.map((b) => b.seed), [0, 1].map((i) => drawSeed(7, "red_start", i)));
  for (const body of bodies) assert.ok(body.grammar && !("json_schema" in body));
});

test("identical draws (what a greedy profile returns) merge into one node", async () => {
  const same = async (url) => (url.endsWith("/props")
    ? { ok: true, json: async () => FIXTURES.props }
    : reply(stepLine(2, { label: "Red refuses", expr: "refuse(red, mother)", state: "Red is at home." })));
  const { stats } = await growGraph({ ...CONFIG, graph: seeds.red, depth: 1, width: 3, client: createClient({ fetch: same }) });
  assert.strictEqual(stats.created, 1);
  assert.strictEqual(stats.mergedDuplicates, 2);
});

test("same input twice yields byte-identical canonical JSON", async () => {
  const a = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  const b = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.strictEqual(Ids.canonicalJson(a.graph), Ids.canonicalJson(b.graph));
  assert.deepStrictEqual(a.stats, b.stats);
});

test("same-content proposals on parallel paths merge instead of duplicating", async () => {
  const { graph, stats } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  // Both round-2 expansion points draw shelter(red, cottage); merge-on-
  // insert must collapse the second into the first (§5.5.4 — the grower
  // itself does no dedup).
  const shelters = graph.nodes.filter(
    (n) => Ids.normalizedContent(n.expr) === "shelter(red, cottage)",
  );
  assert.strictEqual(shelters.length, 1);
  assert.strictEqual(stats.created, 4); // escort, refuse, shelter, turn_back
  assert.strictEqual(stats.mergedDuplicates, 2); // the second shelter + arrive→red_arrive
  assert.strictEqual(stats.expansions, 3); // red_start + the two round-1 branches
  assert.strictEqual(stats.truncated, 0);
});

test("a proposal that is a seed state collapses INTO the told story", async () => {
  // Once a draw names
  // a state the story already has, sameInContext collapses it into the seed
  // node and the grown branch reconnects to the spine. `arrive(red,
  // grandmother_house)` is red_arrive's own action.
  const { graph } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  const arrivals = graph.nodes.filter(
    (n) => Ids.normalizedContent(n.expr) === "arrive(red, grandmother_house)",
  );
  assert.deepStrictEqual(arrivals.map((n) => n.id), ["red_arrive"]);

  const grownIds = new Set(graph.nodes.filter((n) => n.createdBy === "grown").map((n) => n.id));
  const intoSpine = graph.edges.filter((e) => grownIds.has(e.from) && e.to === "red_arrive");
  assert.strictEqual(intoSpine.length, 1);
  // The survivor is the seed node, unstamped: a merge must not rewrite the
  // told story's provenance with the run that happened to reach it.
  assert.strictEqual(graph.nodes.find((n) => n.id === "red_arrive").createdBy, "seed");
});

test("a draw that merges into the told story is not expanded further", async () => {
  // The told next event, drawn at the root: it merges into red_warn, and the
  // run must stop there rather than grow on from a node nobody selected.
  const bodies = [];
  const toldNext = async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    bodies.push(JSON.parse(options.body));
    return reply(stepLine(2, { label: "Mother warns her", expr: "warn(mother, red, path)", state: "Red has been told to stay on the path." }));
  };
  const { stats } = await growGraph({ ...CONFIG, graph: seeds.red, width: 1, client: createClient({ fetch: toldNext }) });
  assert.strictEqual(stats.mergedDuplicates, 1);
  assert.strictEqual(stats.created, 0);
  assert.strictEqual(stats.expansions, 1);
  assert.strictEqual(bodies.length, 1);
});

test("grown nodes carry provenance and resolved labels", async () => {
  const { graph } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  const grown = graph.nodes.filter((n) => n.createdBy === "grown");
  assert.ok(grown.length > 0);
  for (const node of grown) {
    assert.strictEqual(node.runId, "run_test");
    assert.strictEqual(node.kind, "branch");
    assert.ok(node.label); // resolved BEFORE the id was minted (§3.1)
  }
  // Seed nodes are untouched by provenance stamping.
  assert.strictEqual(graph.nodes.find((n) => n.id === "red_start").createdBy, "seed");
});

test("maxNodes stops creation and the result validates", async () => {
  const capped = await growGraph({ ...CONFIG, graph: seeds.red, client: client(), maxNodes: 3 });
  assert.strictEqual(capped.stats.created, 3);
  const full = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.ok(full.validation.ok, JSON.stringify(full.validation.errors));
});

test("maxNodes stops creation and the result validates", async () => {
  const capped = await growGraph({ ...CONFIG, graph: seeds.red, client: client(), maxNodes: 3 });
  assert.strictEqual(capped.stats.created, 3);
  const full = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.ok(full.validation.ok, JSON.stringify(full.validation.errors));
});

test("a draw that restates its source is refused and counted apart from cycles", async () => {
  // The observed degenerate mode: leave(red, basket) -> leave(red, basket).
  const echoing = async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    const steps = JSON.parse(options.body).prompt.trimEnd().split("\n");
    return reply(steps.at(-1));
  };
  const { graph, stats } = await growGraph({ ...CONFIG, width: 1, graph: seeds.red, client: createClient({ fetch: echoing }) });
  assert.strictEqual(stats.created, 0);
  assert.strictEqual(stats.rejectedNullTransitions, 1);
  assert.strictEqual(stats.rejectedCycles, 0); // not conflated with a cycle
  assert.strictEqual(graph.nodes.length, seeds.red.nodes.length);
});

test("truncated draws are counted, not fatal", async () => {
  const truncating = async (url) => (url.endsWith("/props")
    ? { ok: true, json: async () => FIXTURES.props }
    : reply('{"step": 2, "event": "Red', "limit"));
  const { stats, graph } = await growGraph({ ...CONFIG, graph: seeds.red, client: createClient({ fetch: truncating }) });
  assert.strictEqual(stats.truncated, CONFIG.width); // one expansion point, every draw failed
  assert.strictEqual(stats.expansions, 0);
  assert.strictEqual(graph.nodes.length, seeds.red.nodes.length);
});

test("the input graph is not mutated", async () => {
  const before = JSON.stringify(seeds.red);
  await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.strictEqual(JSON.stringify(seeds.red), before);
});

test("v4 growth: one line becomes one node, sent with a grammar and no schema", async () => {
  const line = stepLine(6, { label: "Red lies about the house", expr: "lie(red, wolf)", state: "The wolf has a wrong address." });
  const seen = [];
  const stub = createClient({
    fetch: async (url, options) => {
      if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
      seen.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ content: line, stop_type: "eos" }) };
    },
  });
  const { graph, stats } = await growGraph({
    graph: seeds.red, client: stub, promptTemplate: TEMPLATE, from: "red_tell", depth: 1, width: 1, maxNodes: 4,
  });
  assert.strictEqual(seen.length, 1);
  assert.ok(seen[0].grammar && !("json_schema" in seen[0]));
  assert.strictEqual(stats.created, 1);
  const grown = graph.nodes.find((n) => n.createdBy === "grown");
  assert.deepStrictEqual([grown.label, grown.expr, grown.state], ["Red lies about the house", "lie(red, wolf)", "The wolf has a wrong address."]);
});
