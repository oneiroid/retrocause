#!/usr/bin/env bash
# Runs the app: model server + grow bridge, then opens the builder.
# `./run.sh --no-model` skips the model server. Details: tools/lab.sh.
exec "$(cd "$(dirname "$0")" && pwd)/tools/lab.sh" "$@"
