// llama-server transport (LOCAL_LLM.md §5.2). Owns the determinism profile
// and the response cache. Node-only — this is deliberately the first module
// in the repo that breaks the dual-mode convention, because it does HTTP and
// disk I/O; it exports via `module.exports` and is never added to the page.
//
// Everything reproducibility-critical that llama.cpp treats as a *request*
// field is pinned here, because it cannot be pinned in the server launcher:
// `cache_prompt` in particular is not even reported by `/props`, so the run
// manifest must record it from the request this client actually sent (§5.4).

"use strict";

const fs = require("fs");
const path = require("path");
const Ids = require("./ids.js");

// The reference sampling profile (§4.1, §5.4). Every field is set explicitly
// rather than left to a server default, because on this build (f5b9bd3) the
// defaults are not neutral: temperature 0.8, top_k 40, seed 4294967295. A
// request that forgets to pin one is silently sampling.
//
//   temperature 0 / top_k 1  — greedy decoding
//   seed                     — explicit integer, never the -1 default
//   samplers                 — explicit order; with top_k 1 the chain is
//                              greedy regardless, but an implicit order is a
//                              hidden hyperparameter that varies across builds
//   repeat_penalty 1, dry_multiplier 0
//                            — repetition machinery off, stated not defaulted
//   n_predict                — capped; a length-stopped completion is invalid
//                              JSON with the grammar working perfectly (§5.3)
//   cache_prompt false       — KV-cache reuse mixes batch sizes and destroys
//                              bit-replay; it defaults to TRUE upstream (§4.1)
const REFERENCE_SAMPLING = {
  temperature: 0,
  top_k: 1,
  seed: 7,
  samplers: ["top_k", "temperature"],
  repeat_penalty: 1.0,
  dry_multiplier: 0,
  n_predict: 512,
  cache_prompt: false,
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";

// On this build a completion that ends at EOS reports
// `"stop_type": "eos", "stopped_limit": null` — the boolean-looking field is
// null, not false, so `stop_type` is the only reliable truncation signal (§5.3).
const STOP_TYPE_TRUNCATED = "limit";

function createClient({
  baseUrl = DEFAULT_BASE_URL,
  fetch = globalThis.fetch,
  cacheDir = null,
  sampling = {},
} = {}) {
  if (typeof fetch !== "function") throw new Error("llm_client needs a fetch implementation");

  // Overrides are merged once at construction so every request in a run
  // shares one sampling block — the block the manifest records.
  const pinned = { ...REFERENCE_SAMPLING, ...sampling };

  let propsPromise = null;

  // `/props` is read once per run (§0). It is the record of every server-side
  // default the requests did NOT override — exactly the class of hidden
  // hyperparameter §4.2 is about — so callers capture it wholesale.
  function props() {
    if (!propsPromise) {
      propsPromise = fetch(`${baseUrl}/props`).then((res) => {
        if (!res.ok) throw new Error(`/props returned ${res.status}`);
        return res.json();
      });
    }
    return propsPromise;
  }

  // The model fingerprint folds into every cache key: a recorded response is
  // only a valid stand-in for the same weights on the same build.
  async function fingerprint() {
    const p = await props();
    return [p.build_info || "", p.model_path || "", p.model_ftype || ""].join("|");
  }

  // The request body is CONSTRUCTED in a fixed key order (§5.5.2):
  // JSON.stringify preserves insertion order, and the serialized body is the
  // cache key, so a reordered body would be a cache miss and a different run.
  function requestBody(prompt, schema) {
    return {
      prompt: String(prompt),
      temperature: pinned.temperature,
      top_k: pinned.top_k,
      seed: pinned.seed,
      samplers: pinned.samplers,
      repeat_penalty: pinned.repeat_penalty,
      dry_multiplier: pinned.dry_multiplier,
      n_predict: pinned.n_predict,
      cache_prompt: pinned.cache_prompt,
      ...(schema ? { json_schema: schema } : {}),
    };
  }

  function cacheKeyFor(body, modelFingerprint) {
    return Ids.shortHash(`${modelFingerprint}\n${JSON.stringify(body)}`);
  }

  function cachePath(key) {
    return path.join(cacheDir, `${key}.json`);
  }

  // One completion. Resolves to { content, stopType, cached, cacheKey }.
  // Truncation is a HARD failure (error with `.truncated = true`), never a
  // silent retry with a bigger cap — that would make the run irreproducible.
  //
  // `bypassCache` skips the cache READ but still records: this is what makes
  // `grow:replay` cache-cold (§4.2) while leaving fresh fixtures behind.
  async function complete(prompt, schema, { bypassCache = false } = {}) {
    const body = requestBody(prompt, schema);
    const key = cacheKeyFor(body, await fingerprint());

    if (cacheDir && !bypassCache && fs.existsSync(cachePath(key))) {
      const entry = JSON.parse(fs.readFileSync(cachePath(key), "utf8"));
      return finish(entry.response, key, true);
    }

    const res = await fetch(`${baseUrl}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`/completion returned ${res.status}`);
    const response = await res.json();

    if (cacheDir) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        cachePath(key),
        JSON.stringify({ request: body, response, recordedAt: new Date().toISOString() }, null, 2),
      );
    }
    return finish(response, key, false);
  }

  function finish(response, key, cached) {
    if (response.stop_type === STOP_TYPE_TRUNCATED) {
      const error = new Error(`completion truncated at n_predict=${pinned.n_predict}`);
      error.truncated = true;
      throw error;
    }
    return { content: response.content, stopType: response.stop_type, cached, cacheKey: key };
  }

  return { props, complete, sampling: pinned, baseUrl };
}

module.exports = { createClient, REFERENCE_SAMPLING };
