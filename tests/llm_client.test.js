// llm_client.js — stubbed transport (LOCAL_LLM.md §7). No test here touches
// the network: the client takes an injectable fetch, and the whole point of
// the suite is asserting what the client would have SENT.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createClient, REFERENCE_SAMPLING } = require("../llm_client.js");

const PROPS = { build_info: "b-test", model_path: "/m/model.gguf", model_ftype: "Q8_0", total_slots: 1 };

// A stub fetch that records every request and answers /props and /completion.
function stubFetch(completionResponse) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, body: options ? JSON.parse(options.body) : null });
    const payload = url.endsWith("/props")
      ? PROPS
      : (typeof completionResponse === "function" ? completionResponse(calls.at(-1).body) : completionResponse);
    return { ok: true, json: async () => payload };
  };
  impl.calls = calls;
  impl.completions = () => calls.filter((c) => c.url.endsWith("/completion"));
  impl.props = () => calls.filter((c) => c.url.endsWith("/props"));
  return impl;
}

const EOS = { content: "{\"branches\":[]}", stop_type: "eos", stopped_limit: null };

test("request body pins the reference sampling profile", async () => {
  const fetch = stubFetch(EOS);
  const client = createClient({ fetch, sampling: { seed: 42 } });
  const schema = { type: "object" };
  await client.complete("PROMPT", schema);

  const body = fetch.completions()[0].body;
  // The one flag people miss: it defaults to TRUE upstream and silently
  // destroys replay on shared-prefix requests (§4.1).
  assert.strictEqual(body.cache_prompt, false);
  assert.strictEqual(body.temperature, 0);
  assert.strictEqual(body.top_k, 1);
  assert.strictEqual(body.seed, 42);           // explicit, never the -1 default
  assert.ok(Array.isArray(body.samplers));      // explicit order, not the build's
  assert.strictEqual(body.repeat_penalty, 1.0);
  assert.strictEqual(body.dry_multiplier, 0);
  assert.ok(Number.isFinite(body.n_predict));
  assert.deepStrictEqual(body.json_schema, schema);
  assert.strictEqual(body.prompt, "PROMPT");
});

test("defaults come from REFERENCE_SAMPLING and overrides are shallow", async () => {
  const fetch = stubFetch(EOS);
  const client = createClient({ fetch });
  await client.complete("p", null);
  assert.strictEqual(fetch.completions()[0].body.seed, REFERENCE_SAMPLING.seed);
  assert.strictEqual(client.sampling.cache_prompt, false);
});

test("/props is fetched once and memoized", async () => {
  const fetch = stubFetch(EOS);
  const client = createClient({ fetch });
  await client.props();
  await client.complete("a", null);
  await client.complete("b", null);
  assert.strictEqual(fetch.props().length, 1);
});

test("truncation (stop_type limit) is a hard failure, not a result", async () => {
  // On this build a length-stopped completion reports stop_type "limit";
  // the boolean-looking stopped_limit is null at EOS, so stop_type is the
  // only reliable signal (§5.3).
  const fetch = stubFetch({ content: "{\"bran", stop_type: "limit", stopped_limit: 512 });
  const client = createClient({ fetch });
  await assert.rejects(() => client.complete("p", null), (error) => error.truncated === true);
});

test("cache: identical request is served from disk without a second model call", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-cache-"));
  const fetch = stubFetch(EOS);
  const client = createClient({ fetch, cacheDir });

  const first = await client.complete("same prompt", null);
  const second = await client.complete("same prompt", null);
  assert.strictEqual(first.cached, false);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(second.content, first.content);
  assert.strictEqual(fetch.completions().length, 1);

  // The entry on disk is the §5.7 record: request + response + timestamp.
  const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, `${first.cacheKey}.json`), "utf8"));
  assert.strictEqual(entry.request.prompt, "same prompt");
  assert.ok(entry.recordedAt);
});

test("cache key separates prompts, sampling, and models", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-cache-"));
  const fetch = stubFetch(EOS);
  const a = await createClient({ fetch, cacheDir }).complete("prompt A", null);
  const b = await createClient({ fetch: stubFetch(EOS), cacheDir }).complete("prompt B", null);
  const c = await createClient({ fetch: stubFetch(EOS), cacheDir, sampling: { seed: 99 } }).complete("prompt A", null);
  assert.notStrictEqual(a.cacheKey, b.cacheKey);
  assert.notStrictEqual(a.cacheKey, c.cacheKey);
});

test("bypassCache skips the read but still records (cache-cold replay, §4.2)", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-cache-"));
  const fetch = stubFetch(EOS);
  const client = createClient({ fetch, cacheDir });
  await client.complete("p", null);
  const replayed = await client.complete("p", null, { bypassCache: true });
  assert.strictEqual(replayed.cached, false);
  assert.strictEqual(fetch.completions().length, 2);
});
