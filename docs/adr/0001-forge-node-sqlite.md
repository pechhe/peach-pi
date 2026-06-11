# ADR-0001: Electron Forge + node:sqlite

Status: Accepted (2026-06-11)

## Decision

1. **Electron Forge** (vite plugin) for build/package/make. Spike succeeded:
   packaged arm64 .app boots and passes e2e. Caveats found and fixed:
   - pnpm requires `node-linker=hoisted` (`.npmrc`).
   - Node 24.16+ breaks `extract-zip` (electron/electron#51619) →
     root `pnpm.overrides: { yauzl: "^3.3.1" }`.
   - Forge vite plugin emits **CJS** main/preload → no `"type": "module"`
     in app package.json; use `__dirname`, not `import.meta.dirname`
     (compiles to `void 0` silently).
   - Signing/notarization + auto-update still unproven — revisit before
     first release; electron-builder remains the fallback.
   - **Resolved (2026-06-11)**: `@earendil-works/pi-coding-agent` stays
     external to the main bundle (it loads extensions/resources at runtime).
     Packaging fixed by two pieces:
     1. `packageAfterCopy` hook in forge.config.ts (`vendorPiSdk`) walks the
        SDK's production dependency closure (~130 packages) from the hoisted
        workspace node_modules and copies it into the app dir; missing
        optional platform prebuilds are skipped; `asar: { unpack: "**/*.node" }`
        keeps N-API prebuilds (clipboard, pi-tui) loadable.
     2. The SDK is ESM-only (`exports` has only an `import` condition), so
        CJS `require()` of it fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
        pi-client therefore imports SDK *values* via dynamic `import()` (types
        stay static) — Rollup's `dynamicImportInCjs` preserves real import()
        in the CJS main bundle. Do not convert these to static imports.
     Verified by tests/core/thread-create.spec.ts (packaged app creates a
     live pi session with a persisted session file).

2. **node:sqlite (`DatabaseSync`)** instead of better-sqlite3.
   Ships inside Electron's Node (24.16) — no native rebuild, no asar
   unpacking, unit-testable in plain node. Wrapped in
   `electron/persistence/db.ts` so swapping to better-sqlite3 stays a
   one-file change if the experimental API regresses.

3. **No parameter properties** in TS classes — Node strip-only type
   stripping (used for unit tests) rejects them.
