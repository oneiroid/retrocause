#!/usr/bin/env bash
# Starts llama-server for the grower. The weights and the llama.cpp build live
# in the sibling llmfinetune workspace; this repo ships neither.
#
#   ./tools/serve_model.sh
#   PORT=8090 SLOTS=4 ./tools/serve_model.sh
#   MODEL=/path/to/other.gguf ./tools/serve_model.sh
set -euo pipefail

LLM_HOME="${LLM_HOME:-/media/oneiroid/sub/workspace/llmfinetune}"
MODEL="${MODEL:-$LLM_HOME/models/NVIDIA-Nemotron-3.5-Bolt-E4B-UD-Q4_K_XL.gguf}"
SERVER="${SERVER:-$LLM_HOME/vendor/llama.cpp/build-cuda/bin/llama-server}"
PORT="${PORT:-8080}"

# Concurrent generations. Measured on the 6 GB RTX 3000 (2026-11-01), total
# tok/s: 27 on one slot, 70 on eight, 150 on sixteen (5.0 GB of VRAM), 165 on
# twenty-four (5.6 GB). Thirty-two does not load.
SLOTS="${SLOTS:-16}"
# The context is one pool shared by all slots (--kv-unified). 2048 per slot is
# room for a 40-event path (grower.js elides longer ones) plus one expansion.
CTX_PER_SLOT="${CTX_PER_SLOT:-2048}"
GPU_LAYERS="${GPU_LAYERS:-99}"
THREADS="${THREADS:-8}"

for path in "$SERVER" "$MODEL"; do
  if [ ! -f "$path" ]; then
    echo "missing: $path — set LLM_HOME, or MODEL and SERVER" >&2
    exit 1
  fi
done

echo "$(basename "$MODEL"): $SLOTS slots, $CTX_PER_SLOT ctx each, $GPU_LAYERS gpu layers" >&2

# Loopback only. --cache-ram 0 skips copying each slot's state to host memory
# between requests; the grower gets its reuse from the slots' own prefixes.
exec "$SERVER" \
  --model "$MODEL" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --threads "$THREADS" \
  --parallel "$SLOTS" \
  --ctx-size "$((SLOTS * CTX_PER_SLOT))" \
  --n-gpu-layers "$GPU_LAYERS" \
  --kv-unified \
  --cache-ram 0
