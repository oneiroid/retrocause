#!/usr/bin/env bash
# One command for the Lab panel: starts the model server and the grow bridge,
# waits until both answer, opens the builder in the browser, and keeps both
# running until Ctrl-C — which stops both. If either one dies, the other is
# stopped too.
#
#   ./tools/lab.sh                         # qwen3-4b-cuda on :8080
#   PROFILE=ref-1.7b-cpu ./tools/lab.sh    # any serve_reference.sh profile
#   LLAMA_PORT=8090 ./tools/lab.sh         # if 8080 is taken
#
# Logs go to $LOG_DIR (default /tmp/retrocause-lab), not the terminal: the
# model server is too chatty to share a screen with anything.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${PROFILE:-qwen3-4b-cuda}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
# Fixed: story_builder_app.js has the bridge URL hardcoded (GROW_SERVER_URL).
BRIDGE_PORT=8081
LOG_DIR="${LOG_DIR:-${TMPDIR:-/tmp}/retrocause-lab}"
# Hashing the GGUF and loading it onto the GPU takes tens of seconds; the
# CPU profile longer. Past this, something is wrong rather than slow.
READY_TIMEOUT_S=300

LLAMA_URL="http://127.0.0.1:$LLAMA_PORT"
BRIDGE_URL="http://127.0.0.1:$BRIDGE_PORT"
LLAMA_LOG="$LOG_DIR/llama-server.log"
BRIDGE_LOG="$LOG_DIR/grow-bridge.log"
mkdir -p "$LOG_DIR"

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

for port in "$LLAMA_PORT" "$BRIDGE_PORT"; do
  if port_in_use "$port"; then
    echo "port $port is already in use — stop whatever holds it first" >&2
    exit 1
  fi
done

LLAMA_PID=""
BRIDGE_PID=""
cleanup() {
  trap - EXIT INT TERM
  echo "stopping…" >&2
  for pid in $BRIDGE_PID $LLAMA_PID; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Polls <url>/health until it returns 200, while <pid> is alive.
wait_ready() {
  local name="$1" url="$2" pid="$3" log="$4"
  local deadline=$((SECONDS + READY_TIMEOUT_S))
  until [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/health" || true)" = "200" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name exited during startup — last lines of $log:" >&2
      tail -n 20 "$log" >&2
      exit 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "$name not ready after ${READY_TIMEOUT_S}s — see $log" >&2
      exit 1
    fi
    sleep 1
  done
  echo "$name ready at $url" >&2
}

# serve_reference.sh execs llama-server, so this pid is the server itself.
PROFILE="$PROFILE" PORT="$LLAMA_PORT" "$REPO/tools/serve_reference.sh" >"$LLAMA_LOG" 2>&1 &
LLAMA_PID=$!
echo "model server ($PROFILE) starting — log: $LLAMA_LOG" >&2
wait_ready "model server" "$LLAMA_URL" "$LLAMA_PID" "$LLAMA_LOG"

LLAMA_URL="$LLAMA_URL" GROW_PORT="$BRIDGE_PORT" node "$REPO/tools/grow_server.js" >"$BRIDGE_LOG" 2>&1 &
BRIDGE_PID=$!
echo "grow bridge starting — log: $BRIDGE_LOG" >&2
wait_ready "grow bridge" "$BRIDGE_URL" "$BRIDGE_PID" "$BRIDGE_LOG"

xdg-open "file://$REPO/story_builder.html" >/dev/null 2>&1 &

echo "running — Ctrl-C stops both" >&2
# Returns as soon as either process exits; the EXIT trap stops the other.
wait -n "$LLAMA_PID" "$BRIDGE_PID" || true
echo "a process exited — see $LOG_DIR" >&2
