#!/usr/bin/env bash
# Starts llama-server on a hash-pinned profile (LOCAL_LLM.md §4.1).
#
# Every flag below is part of a profile. Changing one changes the substrate,
# so it must also change what the run manifest records (§5.4) — a graph grown
# under different flags is not a replay of one grown here.
#
# Sampler pinning (temperature, seed, top_k, samplers, cache_prompt) is
# NOT here: those are per-request fields and belong to llm_client.js.
#
# ── profiles ────────────────────────────────────────────────────────────────
#
#   PROFILE=ref-1.7b-cpu    (default)  qwen3-1.7b-base Q8_0, CPU only.
#                                      The Phase 0.5 artifact. Every recorded
#                                      run in runs/ was grown under this.
#   PROFILE=qwen3-4b-cuda              qwen3-4b-base Q5_K_M, fully offloaded
#                                      to the GPU. Added 2026-08-31 for the
#                                      continuation work's model-size arm.
#
# THE DEFAULT IS DELIBERATELY STILL THE 1.7B CPU PROFILE. Continuation plan
# v3 calls the 4B "the new default"; making it one here would silently
# reinterpret every manifest that says it ran against "the reference
# profile". Flipping the default is a one-line commit someone makes on
# purpose after the 4B has been validated — not a side effect of adding it.
#
# ── the CUDA profile is a DIFFERENT SUBSTRATE, not a faster one ─────────────
#
# GPU kernels reorder floating-point reductions, so a run under
# qwen3-4b-cuda is not bit-comparable to one under ref-1.7b-cpu even at
# temperature 0 with an identical prompt. Two variables move at once between
# these profiles — model size AND backend — so a difference between them
# cannot be attributed to size alone. Isolating size would need the 4B on
# CPU (slow, but the honest comparison) or the 1.7B on CUDA.
set -euo pipefail

# This repo ships no weights. The GGUFs and the llama.cpp builds both live in
# the sibling llmfinetune workspace.
LLM_HOME="${LLM_HOME:-/media/oneiroid/sub/workspace/llmfinetune}"
PROFILE="${PROFILE:-ref-1.7b-cpu}"

# Loopback only — nothing about this server is meant to be reachable.
HOST="127.0.0.1"
PORT="${PORT:-8080}"

# Fixed and never sliding. If the window fills and the server truncates, the
# prompt recorded in the manifest is not the prompt the model saw.
CTX_SIZE="${CTX_SIZE:-4096}"

# One slot. On build f5b9bd3 this flag defaults to -1 (auto), and multi-slot
# serving is nondeterministic even at temperature 0 (llama.cpp#7052).
PARALLEL=1

case "$PROFILE" in
  ref-1.7b-cpu)
    MODEL="${MODEL:-$LLM_HOME/models/qwen3-1.7b-base-Q8_0.gguf}"
    SERVER="${SERVER:-$LLM_HOME/vendor/llama.cpp/build/bin/llama-server}"
    # The Phase 0.5 artifact. A different hash is a different model; the
    # manifest's model.sha256 must move with it.
    MODEL_SHA256="8a0dbbf6b697a3c06fc8ee030834e3740af02ef974d7ec3b5921adf5f35b7cba"
    # Fixed, deliberately not $(nproc): a thread count read off the machine
    # is exactly the hidden hyperparameter §4.2 warns about. 16 cores are
    # available here; 8 is the pinned value.
    THREADS="${THREADS:-8}"
    # CPU only. This build has no CUDA backend at all, so the flag is a
    # statement of intent as much as a setting.
    GPU_LAYERS=0
    ;;
  qwen3-4b-cuda)
    MODEL="${MODEL:-$LLM_HOME/models/qwen3-4b-base-Q5_K_M.gguf}"
    SERVER="${SERVER:-$LLM_HOME/vendor/llama.cpp/build-cuda/bin/llama-server}"
    # sha256 of mradermacher/Qwen3-4B-Base-GGUF :: Qwen3-4B-Base.Q5_K_M.gguf,
    # verified on download 2026-08-31. A third-party upload, unlike the 1.7B
    # which Phase 0.5 converted here — so the hash is the only thing standing
    # between this profile and a silently different model. An empty value is
    # refused below rather than skipped: an unpinned model is not a profile.
    MODEL_SHA256="${MODEL_SHA256:-699936b83664f71a4c1d129a1e10b02c1909e8edfdd32962cea75259f4f92093}"
    # Threads matter much less with every layer on the GPU, but an unpinned
    # value is still a hidden hyperparameter.
    THREADS="${THREADS:-8}"
    # 36 transformer layers + output; 99 means "all of them". At Q5_K_M the
    # weights are ~2.8 GB against 6 GB of VRAM, so the KV cache for a 4096
    # window fits alongside them.
    GPU_LAYERS=99
    ;;
  *)
    echo "unknown PROFILE: $PROFILE (want ref-1.7b-cpu or qwen3-4b-cuda)" >&2
    exit 2
    ;;
esac

for path in "$SERVER" "$MODEL"; do
  if [ ! -f "$path" ]; then
    echo "missing: $path" >&2
    echo "set LLM_HOME (or MODEL/SERVER) if the llmfinetune workspace moved" >&2
    exit 1
  fi
done

if [ -z "$MODEL_SHA256" ]; then
  echo "profile $PROFILE has no pinned MODEL_SHA256 — refusing to serve" >&2
  echo "download the GGUF, sha256sum it, and paste the hash into this script" >&2
  exit 1
fi

# Hashing a few GB costs a few seconds. Worth it before any run that claims
# to replay; set SKIP_SHA256=1 for interactive poking.
if [ "${SKIP_SHA256:-0}" != "1" ]; then
  actual="$(sha256sum "$MODEL" | cut -d' ' -f1)"
  if [ "$actual" != "$MODEL_SHA256" ]; then
    echo "model hash mismatch — this is not the pinned $PROFILE artifact" >&2
    echo "  expected $MODEL_SHA256" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
fi

echo "profile $PROFILE — $(basename "$MODEL"), $GPU_LAYERS gpu layers, $THREADS threads" >&2

exec "$SERVER" \
  --model "$MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --threads "$THREADS" \
  --ctx-size "$CTX_SIZE" \
  --parallel "$PARALLEL" \
  --n-gpu-layers "$GPU_LAYERS" \
  --no-cont-batching
