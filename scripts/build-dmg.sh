#!/usr/bin/env bash
# Build a fresh Peach Pi .dmg installer and reveal it.
#
# Signing: if a "Developer ID Application" identity is present in the
# keychain, it is used automatically to sign both the .app (via Forge's
# osxSign, gated on PEACH_PI_SIGN_IDENTITY in forge.config.ts) and the
# .dmg itself (post-make codesign). An override can be passed with
# --identity "Developer ID Application: ...".
#
# Notarization: NOT automatic. For the .dmg to open on other Macs without
# the "damaged" error on Sonoma/Sequoia, you also need notarization — set
# APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID in the env, and Forge will
# notarize the .app. (DMG-level notarization + stapling is not wired here;
# for first-open on a *dragged-out* .app, a notarized .app is what matters.)
#
# Usage:
#   ./scripts/build-dmg.sh                 # build, then reveal .dmg in Finder
#   ./scripts/build-dmg.sh --no-open       # build only
#   ./scripts/build-dmg.sh --open          # build, then mount/open the .dmg
#   ./scripts/build-dmg.sh --identity "..." # force a specific signing identity
set -euo pipefail

cd "$(dirname "$0")/.."

ACTION="reveal"
IDENTITY=""
for arg in "$@"; do
  case "$arg" in
    --no-open) ACTION="none" ;;
    --open)    ACTION="open" ;;
    --reveal)  ACTION="reveal" ;;
    --identity) IDENTITY="${2:-}"; shift ;;
    --identity=*) IDENTITY="${arg#--identity=}" ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

MAKE_DIR="apps/desktop/out/make"
ARCH="$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')"

# --- Resolve signing identity -------------------------------------------------
# Prefer an explicit override, otherwise look for "Developer ID Application"
# (the distribution cert). An "Apple Development" cert is intentionally NOT
# used — it cannot satisfy Gatekeeper on other machines.
if [ -z "$IDENTITY" ]; then
  IDENTITY="$(security find-identity -v -p codesigning \
    | awk -F'"' '/Developer ID Application/ {print $2; exit}' || true)"
fi

if [ -n "$IDENTITY" ]; then
  export PEACH_PI_SIGN_IDENTITY="$IDENTITY"
  echo "==> Signing with identity: $IDENTITY"
else
  echo "==> WARNING: no 'Developer ID Application' identity found in keychain." >&2
  echo "    Build will be UNSIGNED. Gatekeeper on other Macs will report the" >&2
  echo "    .dmg as 'damaged'. To fix:" >&2
  echo "      1. Obtain a Developer ID Application cert (Apple Developer Program)." >&2
  echo "      2. For full distribution, also set APPLE_ID / APPLE_ID_PASSWORD /" >&2
  echo "         APPLE_TEAM_ID for notarization (Sonoma/Sequoia effectively requires it)." >&2
  echo "    Continuing unsigned..." >&2
fi

echo "==> Cleaning previous make output"
rm -rf "$MAKE_DIR"

echo "==> Making .dmg (electron-forge make)"
pnpm --filter @peach-pi/desktop make

DMG="$(ls -1 "$MAKE_DIR"/*-"$ARCH.dmg" 2>/dev/null | head -n1 || true)"
if [ -z "$DMG" ] || [ ! -f "$DMG" ]; then
  echo "make failed: no *-$ARCH.dmg found in $MAKE_DIR" >&2
  exit 1
fi

# Forge signs the .app via osxSign; the .dmg container must be signed separately.
if [ -n "$IDENTITY" ]; then
  echo "==> Signing .dmg"
  codesign --sign "$IDENTITY" --timestamp "$DMG"
fi

echo "==> Built: $DMG"

case "$ACTION" in
  reveal) open -R "$DMG" ;;
  open)   open "$DMG" ;;
  none)   ;;
esac
