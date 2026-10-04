// tools/grow_server.js — the UI→grower bridge, over the fixture transport.
// Model-free like every other test: the handler gets a clientFactory built
// on the same recorded responses grower.test.js replays, and run artifacts
// land in a temp dir, never in runs/.

"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const Ids = require("../ids.js");
const { createClient } = require("../llm_client.js");
const { createHandler, gradePool, MAX_UI_NODES, MAX_UI_K } = require("../tools/grow_server.js");
const Grade = require("../experiments/grade.js");
const { seeds } = require("../seeds.js");
const { stepLine } = require("../grower.js");

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "branch_responses.json"), "utf8"),
);

const JUDGE_SAYS_SAME = {
  content: " yes", stop_type: "limit",
  completion_probabilities: [{ top_logprobs: [{ token: " yes", logprob: Math.log(0.9) }, { token: " no", logprob: Math.log(0.1) }] }],
};

// Same stub transport as grower.test.js: keyed on the last `"action"`, one
// fixture line per draw in draw order.
function fixtureFetch() {
  const drawn = {};
  return async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    const body = JSON.parse(options.body);
    // The merge judge's one-token logprob request: always "same", so a judged
    // run makes exactly the merges the fixture was designed around.
    if (body.n_probs) return { ok: true, json: async () => JUDGE_SAYS_SAME };
    const prompt = body.prompt;
    const expr = [...prompt.matchAll(/"action": "([^"]*)"/g)].at(-1)[1];
    const lines = FIXTURES.completions[expr];
    if (!lines) return { ok: false, status: 500 };
    drawn[expr] = (drawn[expr] ?? -1) + 1;
    const line = lines[drawn[expr] % lines.length];
    return {
      ok: true,
      json: async () => ({ content: stepLine(0, { label: line.event, expr: line.action, state: line.state }), stop_type: "eos", stopped_limit: null }),
    };
  };
}

const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "grow_server_test_"));
const probeDir = path.join(outRoot, "ui");
const handler = createHandler({
  clientFactory: (sampling) => createClient({ fetch: fixtureFetch(), sampling }),
  outRoot,
  probeDir,
});
const server = http.createServer((req, res) => {
  handler(req, res).catch(() => res.end());
});

let base;
test("start server", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(outRoot, { recursive: true, force: true });
});

function growRequest(overrides = {}) {
  return fetch(`${base}/grow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph: seeds.red, from: "red_start", depth: 2, width: 2, ...overrides }),
  });
}

test("POST /grow grows the graph and persists a provenanced run", async () => {
  const res = await growRequest();
  assert.strictEqual(res.status, 200);
  // file:// pages send Origin: null; the CORS header is what lets them read.
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "*");
  const data = await res.json();
  assert.ok(data.stats.created > 0);
  assert.ok(data.graph.nodes.length > seeds.red.nodes.length);
  assert.ok(data.graph.nodes.some((n) => n.createdBy === "grown" && n.runId === data.runId));
  const runDir = path.join(outRoot, data.runId);
  for (const f of ["grown_graph.json", "growth_manifest.json", "input_graph.json", "trace.json"]) {
    assert.ok(fs.existsSync(path.join(runDir, f)), `missing ${f}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "growth_manifest.json"), "utf8"));
  // A UI graph has no seed name — the manifest must say so, not guess one.
  assert.strictEqual(manifest.input.seed, null);
  // Model runs confirm merges with the judge, and say which one.
  assert.strictEqual(manifest.judge.prompt, "same.v2");
  assert.ok(data.trace.some((e) => (e.judgements || []).length > 0));

  // The trace: one entry per expansion, the prompt as sent, its grammar,
  // `width` completions each. Persisted, and served back with the run.
  assert.strictEqual(data.trace.length, data.stats.expansions);
  const [first] = data.trace;
  assert.strictEqual(first.from, "red_start");
  assert.ok(first.prompt.includes('"action": "send(mother, red, basket)"') && first.grammar.startsWith("root ::="));
  assert.strictEqual(first.draws.length, 2);
  const loaded = await (await fetch(`${base}/runs/${data.runId}`)).json();
  assert.deepStrictEqual(loaded.trace, data.trace);
});

test("POST /prompt previews what a grow would send, without a model call; GET /prompts lists templates", async () => {
  const preview = await (await fetch(`${base}/prompt`, {
    method: "POST", body: JSON.stringify({ graph: seeds.red, from: "red_tell" }),
  })).json();
  assert.strictEqual(preview.promptVersion, "branch.v4");
  assert.ok(preview.prompt.trimEnd().endsWith('"action": "tell(red, wolf, grandmother_house)", "state": "The wolf knows Red\'s destination, that her grandmother is alone there, and that she is expected."}'));
  assert.match(preview.grammar, /"step\\": 6/);
  assert.strictEqual((await fetch(`${base}/prompt`, { method: "POST", body: JSON.stringify({ graph: seeds.red, from: "nope" }) })).status, 400);

  const { templates } = await (await fetch(`${base}/prompts`)).json();
  assert.ok(templates.some((t) => t.name === "branch.v4" && t.text.includes("{{steps}}")));
});

test("identical requests produce identical runIds and byte-identical graphs", async () => {
  const a = await (await growRequest()).json();
  const b = await (await growRequest()).json();
  assert.strictEqual(a.runId, b.runId);
  assert.strictEqual(Ids.canonicalJson(a.graph), Ids.canonicalJson(b.graph));
});

test("the UI node budget is capped", async () => {
  const res = await growRequest({ maxNodes: 10000 });
  const data = await res.json();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outRoot, data.runId, "growth_manifest.json"), "utf8"),
  );
  assert.strictEqual(manifest.traversal.maxNodes, MAX_UI_NODES);
});

test("bad requests are 400, unknown routes 404", async () => {
  const noGraph = await fetch(`${base}/grow`, { method: "POST", body: "{}" });
  assert.strictEqual(noGraph.status, 400);
  const noFrom = await growRequest({ from: undefined });
  assert.strictEqual(noFrom.status, 400);
  const lost = await fetch(`${base}/nope`);
  assert.strictEqual(lost.status, 404);
});

test("POST /grow source=baseline grows without a model and records its source", async () => {
  const res = await growRequest({ source: "baseline", from: "red_tell", depth: 1 });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.score.grownNodes > 0);
  assert.strictEqual(data.baseline, undefined, "no baseline row beside the baseline itself");
  const manifest = JSON.parse(fs.readFileSync(path.join(outRoot, data.runId, "growth_manifest.json"), "utf8"));
  assert.deepStrictEqual(manifest.source, { name: "baseline" });
});

test("POST /grow source=model returns §6 scores and a matched-count baseline", async () => {
  const data = await (await growRequest()).json();
  assert.strictEqual(data.score.grownNodes, data.stats.created);
  assert.ok(data.baseline && data.baseline.grownNodes <= data.score.grownNodes);
  const manifest = JSON.parse(fs.readFileSync(path.join(outRoot, data.runId, "growth_manifest.json"), "utf8"));
  assert.strictEqual(manifest.source, undefined, "the default source's config is unchanged");
});

test("GET /runs lists recorded runs; GET /runs/:id rescores one and rejects bad ids", async () => {
  const { runs } = await (await fetch(`${base}/runs`)).json();
  assert.ok(runs.length > 0);
  assert.ok(runs.some((r) => r.source === "baseline"));
  const one = await (await fetch(`${base}/runs/${runs[0].runId}`)).json();
  assert.ok(Array.isArray(one.graph.nodes));
  assert.strictEqual(typeof one.score.grownNodes, "number");
  assert.strictEqual((await fetch(`${base}/runs/..%2F..%2Fetc`)).status, 400);
});

async function probeEvents(body) {
  const res = await fetch(`${base}/continue`, { method: "POST", body: JSON.stringify(body) });
  assert.strictEqual(res.status, 200);
  return (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
}

test("POST /continue streams progress, then the pool in grade order; /grades writes a grade.js file", async () => {
  const events = await probeEvents({ graph: seeds.red, from: "red_start", arms: ["branch.v4"], k: 2 });
  const done = events.at(-1);
  assert.strictEqual(done.type, "done", JSON.stringify(done));
  assert.ok(events.slice(0, -1).every((e) => e.type === "progress"));
  assert.ok(done.pool.length > 0);
  assert.deepStrictEqual(done.prompts.map((p) => p.arm), ["branch.v4"]);
  assert.ok(done.prompts[0].prompt.includes("==> stories/") && done.prompts[0].grammar);

  const probeFile = JSON.parse(fs.readFileSync(path.join(probeDir, done.file), "utf8"));
  assert.deepStrictEqual(done.pool.map((p) => p.labelKey), gradePool(probeFile).map((r) => r.labelKey));

  // Half-answered rows are dropped, not recorded as "no".
  const answers = Object.fromEntries(done.pool.map((p, i) => [p.labelKey, i === 0 ? { consistent: true } : { consistent: false, advances: true }]));
  const graded = await (await fetch(`${base}/grades`, { method: "POST", body: JSON.stringify({ file: done.file, answers }) })).json();
  assert.strictEqual(graded.graded, done.pool.length - 1);
  assert.strictEqual(graded.cumulative.batches, 1);
  const file = JSON.parse(fs.readFileSync(path.join(probeDir, graded.gradedFile), "utf8"));
  assert.strictEqual(file.manifest.rater, "human");
  assert.deepStrictEqual(Grade.summarize(file.grades, "branch.v4"), graded.summary["branch.v4"]);

  // Re-drawing the same batch lands on the same file and carries its grades.
  const again = (await probeEvents({ graph: seeds.red, from: "red_start", arms: ["branch.v4"], k: 2 })).at(-1);
  assert.strictEqual(again.file, done.file);
  assert.strictEqual(Object.keys(again.answers).length, done.pool.length - 1);
});

test("POST /continue rejects arms that are not prompt versions", async () => {
  const res = await fetch(`${base}/continue`, {
    method: "POST", body: JSON.stringify({ graph: seeds.red, from: "red_start", arms: ["sentence"] }),
  });
  assert.strictEqual(res.status, 400);
  assert.ok(MAX_UI_K > 0);
});

test("POST /grow takes a prompt version and records it", async () => {
  const data = await (await growRequest({ prompt: "branch.v4" })).json();
  const manifest = JSON.parse(fs.readFileSync(path.join(outRoot, data.runId, "growth_manifest.json"), "utf8"));
  assert.strictEqual(manifest.prompt.template, "branch.v4");
  // Grown under the sampled profile: greedy would make every draw one line.
  assert.deepStrictEqual(
    [manifest.profile, manifest.sampling.temperature, manifest.sampling.min_p, manifest.sampling.top_k],
    ["sampled", 1, 0.05, 0],
  );
  assert.strictEqual((await growRequest({ prompt: "frames.v1" })).status, 400);
});

test("POST /grades refuses files outside the UI probe directory", async () => {
  const res = await fetch(`${base}/grades`, { method: "POST", body: JSON.stringify({ file: "../../package.json", answers: {} }) });
  assert.strictEqual(res.status, 400);
});
