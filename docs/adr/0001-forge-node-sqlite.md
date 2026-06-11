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

2. **node:sqlite (`DatabaseSync`)** instead of better-sqlite3.
   Ships inside Electron's Node (24.16) — no native rebuild, no asar
   unpacking, unit-testable in plain node. Wrapped in
   `electron/persistence/db.ts` so swapping to better-sqlite3 stays a
   one-file change if the experimental API regresses.

3. **No parameter properties** in TS classes — Node strip-only type
   stripping (used for unit tests) rejects them.
