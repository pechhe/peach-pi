#!/bin/sh
# Vercel install entrypoint.
#
# Vercel builds only @peach-pi/mobile (see vercel.json buildCommand), and the
# desktop app is stripped from the build by .vercelignore. However the committed
# pnpm-lock.yaml still carries the `@devtap/electron` dependency as a `file:`
# resolution pointing at ../devtap/packages/electron/dist-bundle, which pnpm
# scans during install even when no importer needs it. On Vercel neither that
# sibling devtap repo nor the dist-bundle exists, so the scan throws ENOENT and
# the build fails.
#
# This script stages a minimal stub package at that path before install so the
# scan succeeds. The real `@devtap/electron` package lives in a sibling devtap
# repo (locally) / a separate build; the stub is never used by the mobile
# build. We only filter-install the mobile subgraph, so the stub is never linked
# into node_modules anyway.

set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
STUB="$ROOT/../devtap/packages/electron/dist-bundle"

if [ ! -f "$STUB/package.json" ]; then
  mkdir -p "$STUB"
  cat > "$STUB/package.json" <<'JSON'
{
  "name": "@devtap/electron",
  "version": "0.0.0-stub",
  "private": true,
  "description": "Stub package to satisfy the pnpm-lock file: dependency scan during Vercel mobile builds. Real package lives in the sibling devtap repo.",
  "main": "./index.js"
}
JSON
  printf 'module.exports = {};\n' > "$STUB/index.js"
fi

exec pnpm install --filter @peach-pi/mobile... --frozen-lockfile
