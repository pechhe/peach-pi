# ADR-0007: Cua Driver for native background computer use

Status: Accepted (2026-06-22)

## Decision

peach-pi adopts **Cua Driver** (open-source, MIT — `trycua/cua`) as the native
computer-use backend, and **bundles `CuaDriver.app` inside the product** so it
ships and works by default. The pi agent drives it through the `cua-driver`
**CLI** taught by an auto-installed skill (`~/.pi/agent/skills/cua-driver/SKILL.md`),
not over MCP — pi has no native MCP support.

The computer-use stack is now **three complementary tools**, picked in order:

1. **Programmatic** (CLI / API / connector) — always preferred; no UI at all.
2. **Web pages → `agent-browser`** — DOM-aware, web-native (CDP). Unchanged.
3. **Native desktop UI → `cua-driver`** — background native control (macOS apps,
   system dialogs, menu bar, anything with no web/API surface).

`agent-browser` is **not** replaced: it drives web content via the DOM; Cua Driver
drives native windows via the macOS Accessibility tree. Different control planes.

## How it ships

- A pinned, checksum-verified release tarball (`scripts/fetch-cua-driver.mjs`,
  Cua Driver `v0.2.0`, universal build) is vendored into `build/cua-driver/` by the
  Forge `prePackage` hook, then copied into `Contents/Resources/` via `extraResource`.
- On first launch, `CuaDriverService` copies the bundled `CuaDriver.app` to
  `/Applications` (via `ditto`, preserving the signature), starts the daemon in the
  background (`open -g -a CuaDriver --args serve` — no cursor/focus steal), and
  installs the agent skill. All steps are best-effort and never block boot.
- The Connections view shows read-only driver status + a "Grant permissions" action.

## Why Option A (bundle the signed `CuaDriver.app`)

macOS TCC keys Accessibility + Screen Recording grants to a **signed bundle
identity**. Cua ships `CuaDriver.app` signed as `com.trycua.driver`, and running
the driver as that app is what makes grants attach correctly and **survive
upgrades**. Installing to `/Applications` mirrors Cua's own installer, so a
peach-pi-installed driver and a standalone one share the same grant state.

## Considered Options

- **Option B — bundle the Rust backend binary, run under Peach Pi's identity.**
  Simpler packaging (one plain binary, no nested `.app`, no `/Applications` write),
  but it bets on the non-default macOS backend and shifts TCC ownership onto
  `Peach Pi.app`. Rejected: less-proven on macOS, and conflates Peach Pi's
  permissions with the driver's.
- **MCP registration instead of the CLI skill.** Rejected: pi has no native MCP;
  Cua's own docs recommend the plain CLI for pi. The CLI route also preserves the
  existing screenshot → `analyze_image` pattern (`get_window_state capture_mode:vision`).
- **Curl-install at runtime.** Rejected: the product must work offline/by default;
  build-time vendoring keeps the shipped version pinned and reproducible.

## Consequences

- The release lane must **notarize a DMG containing a nested signed `.app`**
  (`com.trycua.driver`). The existing `osxSign`/`osxNotarize` config handles signing;
  verify the nested bundle staples cleanly when cutting the first signed release.
- Two app icons exist on the user's system (Peach Pi + CuaDriver). Acceptable.
- Writing to `/Applications` may prompt; `ensureInstalled` is a no-op once installed
  and degrades gracefully (status reports `not installed`).
- Bumping the driver: update `VERSION` + `SHA256` in `scripts/fetch-cua-driver.mjs`
  (digests come from the GitHub release asset metadata).
