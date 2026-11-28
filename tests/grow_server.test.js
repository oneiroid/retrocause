// The bridge's handler over a scripted client: no network, no model.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createHandler } = require("../tools/grow_server.js");
const { seeds } = require("../seeds.js");

function fakeClient({ fail = false } = {}) {
  let call = 0;
  return {
    props: async () => {
      if (fail) throw new Error("fetch failed");
      return { model_path: "/m/nemo.gguf", total_slots: 4, build_info: "b" };
    },
    chat: async ({ onToken }) => {
      call += 1;
      const content = `Event ${call}a | State ${call}a.\nEvent ${call}b | State ${call}b.`;
      if (onToken) onToken(content, content);
      return { content, tokens: 2, finishReason: "stop", promptTokens: 1, cachedTokens: 0 };
    },
    yesProbability: async () => 0,
  };
}

async function withServer(options, body) {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "retrocause-runs-"));
  const handler = createHandler({ clientFactory: () => fakeClient(options), outRoot });
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await body({ base, outRoot });
  } finally {
    server.close();
    fs.rmSync(outRoot, { recursive: true, force: true });
  }
}

const post = (base, route, payload) => fetch(`${base}${route}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const events = async (response) => (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line));

test("/health reports the model and its slots, or that it is down", async () => {
  await withServer({}, async ({ base }) => {
    const data = await (await fetch(`${base}/health`)).json();
    assert.deepStrictEqual([data.model, data.modelFile, data.slots], [true, "nemo.gguf", 4]);
  });
  await withServer({ fail: true }, async ({ base }) => {
    const data = await (await fetch(`${base}/health`)).json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.model, false);
  });
});

test("/grow streams nodes and progress, ends in done, and records the run", async () => {
  await withServer({}, async ({ base, outRoot }) => {
    const stream = await events(await post(base, "/grow", {
      graph: seeds.red, from: "red_woods", depth: 2, width: 2, beam: 8, maxNodes: 10, merge: false,
    }));
    assert.strictEqual(stream[0].type, "start");
    assert.strictEqual(stream.filter((e) => e.type === "node").length, 6);
    assert.ok(stream.some((e) => e.type === "progress"));
    assert.ok(stream.some((e) => e.type === "expansion"));
    const done = stream.at(-1);
    assert.strictEqual(done.type, "done");
    assert.strictEqual(done.stats.created, 6);
    assert.ok(done.validation.ok);

    const dir = path.join(outRoot, done.runId);
    for (const file of ["grown_graph.json", "growth_manifest.json", "trace.json", "input_graph.json"]) {
      assert.ok(fs.existsSync(path.join(dir, file)), file);
    }
    const { runs } = await (await fetch(`${base}/runs`)).json();
    assert.strictEqual(runs[0].runId, done.runId);
    assert.strictEqual(runs[0].created, 6);
    const run = await (await fetch(`${base}/runs/${done.runId}`)).json();
    assert.strictEqual(run.manifest.replayable, false);
    assert.strictEqual(run.manifest.traversal.from, "red_woods");
    assert.strictEqual(run.trace.length, 3);
  });
});

test("/grow rejects a bad target before starting", async () => {
  await withServer({}, async ({ base }) => {
    assert.strictEqual((await post(base, "/grow", { graph: seeds.red, from: "nope" })).status, 400);
    assert.strictEqual((await post(base, "/grow", { from: "x" })).status, 400);
  });
});

test("/propose streams tokens and lists alternatives without touching a graph", async () => {
  await withServer({}, async ({ base }) => {
    const stream = await events(await post(base, "/propose", { graph: seeds.red, from: "red_woods", width: 2 }));
    assert.strictEqual(stream[0].type, "progress");
    const done = stream.at(-1);
    assert.strictEqual(done.type, "done");
    assert.strictEqual(done.alternatives.length, 2);
    assert.match(done.user, /Write 2 lines\./);
  });
});

test("/prompt previews with no model call, /prompts lists the templates", async () => {
  await withServer({ fail: true }, async ({ base }) => {
    const preview = await (await post(base, "/prompt", { graph: seeds.red, from: "red_woods", width: 3 })).json();
    assert.match(preview.system, /write 3 different things/);
    assert.match(preview.user, /Events so far/);
    const { templates } = await (await fetch(`${base}/prompts`)).json();
    assert.deepStrictEqual(templates.map((t) => t.name), ["branch.chat", "critic.chat", "future.chat", "same.chat"]);
  });
});

test("run ids are validated and unknown routes are 404", async () => {
  await withServer({}, async ({ base }) => {
    assert.strictEqual((await fetch(`${base}/runs/..%2Fetc`)).status, 400);
    assert.strictEqual((await fetch(`${base}/runs/run_abc123`)).status, 404);
    assert.strictEqual((await fetch(`${base}/nope`)).status, 404);
  });
});
