#!/usr/bin/env bash
# Visual demo of the notch helper without the app: pipes staged NDJSON frames so
# you can watch tucked → running → finish-bounce → hover-to-expand. Ctrl-C to quit.
set -euo pipefail
cd "$(dirname "$0")"
[ -x .build/release/notch-helper ] || swift build -c release

{
  sleep 0.5
  echo '{"type":"state","running":2,"completed":[]}'          # two running: tucked, spinner + "2"
  sleep 3
  echo '{"type":"finish","id":"a","title":"Fix booking tree"}' # bounce out of the notch
  echo '{"type":"state","running":1,"completed":[{"id":"a","title":"Fix booking tree"}]}'
  sleep 3
  echo '{"type":"finish","id":"b","title":"Migrate portal schema"}'
  echo '{"type":"state","running":0,"completed":[{"id":"a","title":"Fix booking tree"},{"id":"b","title":"Migrate portal schema"}]}'
  echo "[demo] two finished — hover the notch to expand and click a row." >&2
  sleep 600
} | ./.build/release/notch-helper
