// llm_client.js over a stub fetch: what it sends, and how it reads the stream.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { createClient } = require("../llm_client.js");

function sseBody(chunks) {
  const encoder = new TextEncoder();
  return (async function* lines() {
    for (const chunk of chunks) yield encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
    yield encoder.encode("data: [DONE]\n\n");
  })();
}

function stubFetch(answer) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, body: options && options.body ? JSON.parse(options.body) : null, signal: options && options.signal });
    return answer(url, calls.at(-1).body);
  };
  impl.calls = calls;
  return impl;
}

const streamOf = (pieces, tail = {}) => ({
  ok: true,
  body: sseBody([
    ...pieces.map((content) => ({ choices: [{ delta: { content } }] })),
    { choices: [{ delta: {}, finish_reason: "stop" }], timings: { prompt_n: 12, cache_n: 30 }, ...tail },
  ]),
});

test("chat turns thinking off, caches the prompt and asks for a stream", async () => {
  const fetch = stubFetch(() => streamOf(["ok"]));
  await createClient({ fetch, baseUrl: "http://x" }).chat({ system: "S", user: "U", maxTokens: 9, temperature: 0.5 });
  const [{ url, body }] = fetch.calls;
  assert.strictEqual(url, "http://x/v1/chat/completions");
  assert.deepStrictEqual(body.messages, [{ role: "system", content: "S" }, { role: "user", content: "U" }]);
  assert.deepStrictEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.strictEqual(body.cache_prompt, true);
  assert.strictEqual(body.stream, true);
  assert.strictEqual(body.max_tokens, 9);
  assert.strictEqual(body.temperature, 0.5);
});

test("chat assembles the stream and reports every token", async () => {
  const seen = [];
  const fetch = stubFetch(() => streamOf(["Red ", "runs", "."]));
  const result = await createClient({ fetch }).chat({
    system: "S", user: "U", maxTokens: 9, temperature: 0, onToken: (piece, text) => seen.push([piece, text]),
  });
  assert.strictEqual(result.content, "Red runs.");
  assert.strictEqual(result.tokens, 3);
  assert.strictEqual(result.finishReason, "stop");
  assert.strictEqual(result.promptTokens, 12);
  assert.strictEqual(result.cachedTokens, 30);
  assert.deepStrictEqual(seen.at(-1), [".", "Red runs."]);
});

test("a server error names the status", async () => {
  const fetch = stubFetch(() => ({ ok: false, status: 400, text: async () => "too long" }));
  await assert.rejects(
    createClient({ fetch }).chat({ system: "S", user: "U", maxTokens: 1, temperature: 0 }),
    /400: too long/,
  );
});

const logprobsAnswer = (top) => () => ({
  ok: true,
  json: async () => ({ choices: [{ logprobs: { content: [{ top_logprobs: top }] } }] }),
});

test("yesProbability sums an answer's variants and normalises over yes and no", async () => {
  const fetch = stubFetch(logprobsAnswer([
    { token: "yes", logprob: Math.log(0.3) },
    { token: " Yes", logprob: Math.log(0.3) },
    { token: "No", logprob: Math.log(0.2) },
    { token: "maybe", logprob: Math.log(0.2) },
  ]));
  const p = await createClient({ fetch }).yesProbability({ system: "S", user: "U" });
  assert.ok(Math.abs(p - 0.75) < 1e-9);
  assert.strictEqual(fetch.calls[0].body.max_tokens, 1);
  assert.strictEqual(fetch.calls[0].body.temperature, 0);
});

test("yesProbability is null when the model did not take the question", async () => {
  const fetch = stubFetch(logprobsAnswer([{ token: "The", logprob: -0.1 }]));
  assert.strictEqual(await createClient({ fetch }).yesProbability({ system: "S", user: "U" }), null);
});
