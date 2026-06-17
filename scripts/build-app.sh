#!/usr/bin/env bash
# Build a fresh Peach Pi .app bundle (unsigned dev build) and reveal it.
#
# Usage:
#   ./scripts/build-app.sh          # build, then open the .app
#   ./scripts/build-app.sh --no-open
#   ./scripts/build-app.sh --reveal # build, then reveal in Finder
set -euo pipefail

cd "$(dirname "$0")/.."

OPEN=1
REVEAL=0
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN=0 ;;
    --reveal)  REVEAL=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

OUT_DIR="apps/desktop/out/Peach Pi-darwin-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')"
APP="$OUT_DIR/Peach Pi.app"

echo "==> Cleaning previous build"
rm -rf "$OUT_DIR"

echo "==> Packaging (electron-forge package)"
pnpm --filter @peach-pi/desktop package

if [ ! -d "$APP" ]; then
  echo "build failed: $APP not found" >&2
  exit 1
fi

echo "==> Built: $APP"

if [ "$REVEAL" = "1" ]; then
  open -R "$APP"
elif [ "$OPEN" = "1" ]; then
  open "$APP"
fi
