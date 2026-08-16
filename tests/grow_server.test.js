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
const { createHandler, MAX_UI_NODES } = require("../tools/grow_server.js");
const { seeds } = require("../seeds.js");

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "branch_responses.json"), "utf8"),
);

// Same stub transport as grower.test.js: keyed on the last `State:` line.
function fixtureFetch() {
  return async (url, options) => {
    if (url.endsWith("/props")) return { ok: true, json: async () => FIXTURES.props };
    const prompt = JSON.parse(options.body).prompt;
    const expr = [...prompt.matchAll(/^State: (.*)$/gm)].at(-1)[1];
    const payload = FIXTURES.completions[expr] || { branches: [] };
    return {
      ok: true,
      json: async () => ({ content: JSON.stringify(payload), stop_type: "eos", stopped_limit: null }),
    };
  };
}

const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "grow_server_test_"));
const handler = createHandler({
  clientFactory: (sampling) => createClient({ fetch: fixtureFetch(), sampling }),
  outRoot,
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
  for (const f of ["grown_graph.json", "growth_manifest.json", "input_graph.json"]) {
    assert.ok(fs.existsSync(path.join(runDir, f)), `missing ${f}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "growth_manifest.json"), "utf8"));
  // A UI graph has no seed name — the manifest must say so, not guess one.
  assert.strictEqual(manifest.input.seed, null);
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
