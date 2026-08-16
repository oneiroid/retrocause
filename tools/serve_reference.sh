#!/usr/bin/env bash
# Starts llama-server on the reference profile (LOCAL_LLM.md §4.1).
#
# Every flag below is part of that profile. Changing one changes the
# substrate, so it must also change what the run manifest records (§5.4) —
# a graph grown under different flags is not a replay of one grown here.
#
# Sampler pinning (temperature, seed, top_k, samplers, cache_prompt) is
# NOT here: those are per-request fields and belong to llm_client.js.
set -euo pipefail

# This repo ships no weights. The GGUF and the llama.cpp build both live in
# the sibling llmfinetune workspace, which produced them in Phase 0.5.
LLM_HOME="${LLM_HOME:-/media/oneiroid/sub/workspace/llmfinetune}"
MODEL="${MODEL:-$LLM_HOME/models/qwen3-1.7b-base-Q8_0.gguf}"
SERVER="${SERVER:-$LLM_HOME/vendor/llama.cpp/build/bin/llama-server}"

# The Phase 0.5 artifact. A different hash is a different model; the
# manifest's model.sha256 must move with it.
MODEL_SHA256="8a0dbbf6b697a3c06fc8ee030834e3740af02ef974d7ec3b5921adf5f35b7cba"

# Loopback only — nothing about this server is meant to be reachable.
HOST="127.0.0.1"
PORT="${PORT:-8080}"

# Fixed, deliberately not $(nproc): a thread count read off the machine is
# exactly the hidden hyperparameter §4.2 warns about. 16 cores are
# available here; 8 is the pinned value.
THREADS=8

# Fixed and never sliding. If the window fills and the server truncates,
# the prompt recorded in the manifest is not the prompt the model saw.
CTX_SIZE=4096

# One slot. On build f5b9bd3 this flag defaults to -1 (auto), and
# multi-slot serving is nondeterministic even at temperature 0
# (llama.cpp#7052).
PARALLEL=1

# CPU only. GPU kernels reorder floating-point reductions. Moot on this
# build, which has no CUDA, but stated so a later CUDA rebuild cannot
# change the substrate silently.
GPU_LAYERS=0

for path in "$SERVER" "$MODEL"; do
  if [ ! -f "$path" ]; then
    echo "missing: $path" >&2
    echo "set LLM_HOME (or MODEL/SERVER) if the llmfinetune workspace moved" >&2
    exit 1
  fi
done

# Hashing 1.8 GB costs a few seconds. Worth it before any run that claims
# to replay; set SKIP_SHA256=1 for interactive poking.
if [ "${SKIP_SHA256:-0}" != "1" ]; then
  actual="$(sha256sum "$MODEL" | cut -d' ' -f1)"
  if [ "$actual" != "$MODEL_SHA256" ]; then
    echo "model hash mismatch — this is not the Phase 0.5 artifact" >&2
    echo "  expected $MODEL_SHA256" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
fi

exec "$SERVER" \
  --model "$MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --threads "$THREADS" \
  --ctx-size "$CTX_SIZE" \
  --parallel "$PARALLEL" \
  --n-gpu-layers "$GPU_LAYERS" \
  --no-cont-batching
