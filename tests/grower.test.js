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
const { createClient } = require("../llm_client.js");
const { growGraph, renderPrompt, BRANCH_SCHEMA } = require("../grower.js");
const { seeds } = require("../seeds.js");

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "branch_responses.json"), "utf8"),
);
const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "branch.v1.txt"),
  "utf8",
);

// The stub transport keys on the target state's expr — the LAST `State:`
// line of the rendered prompt (the few-shot examples contribute earlier
// ones). Unknown states get an empty branch list rather than an error, so a
// fixture gap shows up as a short graph, not a crash.
function fixtureFetch() {
  const impl = async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    const prompt = JSON.parse(options.body).prompt;
    const expr = [...prompt.matchAll(/^State: (.*)$/gm)].at(-1)[1];
    const payload = FIXTURES.completions[expr] || { branches: [] };
    return {
      ok: true,
      json: async () => ({ content: JSON.stringify(payload), stop_type: "eos", stopped_limit: null }),
    };
  };
  return impl;
}

function client() {
  return createClient({ fetch: fixtureFetch() });
}

const CONFIG = {
  promptTemplate: PROMPT_TEMPLATE,
  from: "red_start",
  depth: 2,
  width: 2,
  maxNodes: 24,
  runId: "run_test",
};

test("renderPrompt substitutes the target node deterministically", () => {
  const rendered = renderPrompt(PROMPT_TEMPLATE, seeds.red.nodes[0]);
  assert.ok(rendered.includes("State: send(mother, red, basket)"));
  assert.ok(rendered.trimEnd().endsWith("Alternatives:"));
});

test("same input twice yields byte-identical canonical JSON", async () => {
  const a = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  const b = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.strictEqual(Ids.canonicalJson(a.graph), Ids.canonicalJson(b.graph));
  assert.deepStrictEqual(a.stats, b.stats);
});

test("the width cap is applied after deterministic candidate sort", async () => {
  const { graph } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  // The root fixture proposes three branches; zzz_filler sorts last by
  // normalized expr and must be the one the width=2 cap cuts (§5.5.3).
  assert.ok(!graph.nodes.some((n) => n.expr === "zzz_filler(red)"));
  assert.ok(graph.nodes.some((n) => n.expr === "escort(mother, red)"));
  assert.ok(graph.nodes.some((n) => n.expr === "refuse(red, mother)"));
});

test("same-content proposals on parallel paths merge instead of duplicating", async () => {
  const { graph, stats } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  // Both round-2 expansion points propose arrive(red, grandmother_house);
  // merge-on-insert must collapse the second into the first (§5.5.4 — the
  // grower itself does no dedup).
  const arrivals = graph.nodes.filter(
    (n) => Ids.normalizedContent(n.expr) === "arrive(red, grandmother_house)",
  );
  assert.strictEqual(arrivals.length, 1);
  assert.strictEqual(stats.mergedDuplicates, 1);
  assert.strictEqual(stats.created, 5); // escort, refuse, arrive, turn_back, watch
  assert.strictEqual(stats.expansions, 3); // red_start + the two round-1 branches
});

test("rejoins: valid kept; missing target and cycle-creating both dropped, node kept", async () => {
  const { graph, stats } = await growGraph({ ...CONFIG, graph: seeds.red, client: client() });

  // escort(mother, red) rejoins red_woods — legal, so the edge exists.
  const escort = graph.nodes.find((n) => n.expr === "escort(mother, red)");
  assert.ok(graph.edges.some((e) => e.from === escort.id && e.to === "red_woods" && e.type === "rejoins"));

  // refuse(red, mother) named no_such_node; arrive(...) named its own
  // ancestor red_start (a cycle). Both dropped and counted (§5.5.6), both
  // nodes still present.
  assert.strictEqual(stats.droppedRejoins, 2);
  assert.ok(graph.nodes.some((n) => n.expr === "refuse(red, mother)"));
  assert.ok(!graph.edges.some((e) => e.to === "red_start"));
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

test("truncated completions are counted, not fatal", async () => {
  const truncatingFetch = async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    return { ok: true, json: async () => ({ content: "{\"bran", stop_type: "limit", stopped_limit: 512 }) };
  };
  const { stats, graph } = await growGraph({
    ...CONFIG,
    graph: seeds.red,
    client: createClient({ fetch: truncatingFetch }),
  });
  assert.strictEqual(stats.truncated, 1); // one expansion point, one failure
  assert.strictEqual(stats.created, 0);
  assert.strictEqual(graph.nodes.length, seeds.red.nodes.length);
});

test("the input graph is not mutated", async () => {
  const before = JSON.stringify(seeds.red);
  await growGraph({ ...CONFIG, graph: seeds.red, client: client() });
  assert.strictEqual(JSON.stringify(seeds.red), before);
});

test("BRANCH_SCHEMA is sent with every completion request", async () => {
  const bodies = [];
  const recordingFetch = async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ content: "{\"branches\":[]}", stop_type: "eos" }) };
  };
  await growGraph({ ...CONFIG, graph: seeds.red, client: createClient({ fetch: recordingFetch }) });
  assert.ok(bodies.length > 0);
  for (const body of bodies) assert.deepStrictEqual(body.json_schema, BRANCH_SCHEMA);
});
