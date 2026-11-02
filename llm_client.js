// llama-server transport for chat models. Node-only: it does HTTP, so it is
// never loaded by the page.
//
// Calls go through /v1/chat/completions so the GGUF's own chat template is
// applied. Thinking is off on every call: reasoning tokens cost generation
// time and the grower reads none of them.

"use strict";

const DEFAULT_BASE_URL = process.env.LLAMA_URL || "http://127.0.0.1:8080";

const THINKING_OFF = { enable_thinking: false };
// How many next-token alternatives yesProbability asks for. Enough that an
// answer's casing and spacing variants all appear when any of them is plausible.
const TOP_LOGPROBS = 20;
const SSE_DATA = "data: ";
const SSE_DONE = "[DONE]";

function createClient({ baseUrl = DEFAULT_BASE_URL, fetch = globalThis.fetch } = {}) {
  if (typeof fetch !== "function") throw new Error("llm_client needs a fetch implementation");

  async function props() {
    const res = await fetch(`${baseUrl}/props`);
    if (!res.ok) throw new Error(`/props returned ${res.status}`);
    return res.json();
  }

  function request(messages, fields, signal) {
    return fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // cache_prompt lets siblings reuse the evaluated story prefix on a slot.
      body: JSON.stringify({ messages, chat_template_kwargs: THINKING_OFF, cache_prompt: true, ...fields }),
      signal,
    });
  }

  // One streamed completion. onToken(piece, textSoFar) fires per token, which
  // is what the Lab's progress runs on. A length stop is not an error: the
  // grower keeps whatever complete alternatives came before the cut.
  async function chat({ system, user, maxTokens, temperature, signal, onToken }) {
    const messages = [{ role: "system", content: system }, { role: "user", content: user }];
    const res = await request(messages, { max_tokens: maxTokens, temperature, stream: true }, signal);
    if (!res.ok) throw new Error(`/v1/chat/completions returned ${res.status}: ${await res.text()}`);

    const decoder = new TextDecoder();
    const result = { content: "", finishReason: null, tokens: 0, promptTokens: 0, cachedTokens: 0 };
    let buffered = "";
    const onLine = (line) => {
      if (!line.startsWith(SSE_DATA)) return;
      const data = line.slice(SSE_DATA.length).trim();
      if (data === SSE_DONE) return;
      const chunk = JSON.parse(data);
      const choice = chunk.choices && chunk.choices[0];
      const piece = choice && choice.delta && choice.delta.content;
      if (piece) {
        result.content += piece;
        result.tokens += 1;
        if (onToken) onToken(piece, result.content);
      }
      if (choice && choice.finish_reason) result.finishReason = choice.finish_reason;
      if (chunk.timings) {
        result.promptTokens = chunk.timings.prompt_n;
        result.cachedTokens = chunk.timings.cache_n;
      }
    };
    for await (const bytes of res.body) {
      buffered += decoder.decode(bytes, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop();
      lines.forEach(onLine);
    }
    onLine(buffered);
    return result;
  }

  // P(yes | yes or no) for a one-word answer, read off the first token's
  // distribution so no sampler decides it. null when neither word is among the
  // alternatives: the model did not take the question.
  async function yesProbability({ system, user, signal }) {
    const messages = [{ role: "system", content: system }, { role: "user", content: user }];
    const res = await request(messages, { max_tokens: 1, temperature: 0, logprobs: true, top_logprobs: TOP_LOGPROBS }, signal);
    if (!res.ok) throw new Error(`/v1/chat/completions returned ${res.status}: ${await res.text()}`);
    const { choices } = await res.json();
    const first = choices[0].logprobs && choices[0].logprobs.content[0];
    if (!first) throw new Error("no logprobs in the response");
    let yes = 0;
    let no = 0;
    for (const { token, logprob } of first.top_logprobs) {
      const word = String(token).trim().toLowerCase();
      if (word === "yes") yes += Math.exp(logprob);
      else if (word === "no") no += Math.exp(logprob);
    }
    return yes + no > 0 ? yes / (yes + no) : null;
  }

  return { props, chat, yesProbability, baseUrl };
}

module.exports = { createClient };
