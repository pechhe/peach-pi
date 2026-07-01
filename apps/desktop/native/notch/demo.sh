#!/usr/bin/env bash
# Visual demo of the notch helper without the app: pipes staged NDJSON frames so
# you can watch tucked → running → finish-bounce → hover-to-expand. Ctrl-C to quit.
set -euo pipefail
cd "$(dirname "$0")"
[ -x .build/release/notch-helper ] || swift build -c release

{
  sleep 0.5
  echo '{"type":"state","running":[{"id":"r1","title":"Refactor auth"},{"id":"r2","title":"Portal booking tree"}],"completed":[]}'  # two running: hex matrix + "2"
  sleep 3
  echo '{"type":"finish","id":"a","title":"Fix booking tree"}' # bounce out of the notch
  echo '{"type":"state","running":[{"id":"r1","title":"Refactor auth"}],"completed":[{"id":"a","title":"Fix booking tree"}]}'
  sleep 3
  echo '{"type":"finish","id":"b","title":"Migrate portal schema"}'
  echo '{"type":"state","running":[{"id":"r1","title":"Refactor auth"}],"completed":[{"id":"a","title":"Fix booking tree"},{"id":"b","title":"Migrate portal schema"}]}'
  echo "[demo] 1 running + 2 finished — hover the notch to expand and click a row." >&2
  sleep 600
} | ./.build/release/notch-helper
