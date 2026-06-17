# peach-pi

Local-first macOS GUI for the pi coding agent. Rewrite of `peche-pi`
(React/electron-vite/electron-builder) into Svelte 5 + Electron Forge.

- Plan: `docs/REWRITE_PLAN.md` (read before structural changes)
- ADRs: `docs/adr/`

## Layout

- `apps/desktop` — Electron app. `electron/` = main process (boot in
  `main.ts`, features in `services/`, persistence in `persistence/`,
  IPC in `ipc/`), `src/` = Svelte renderer (features under
  `src/features/`, stores under `src/stores/`).
- `packages/shared-types` — entities + the typed IPC contract registry
  (`ipcContracts`). Every channel is declared there; preload and main
  derive from it. Never call `ipcMain`/`ipcRenderer` directly.

## Rules

- Renderer never touches Node APIs; everything crosses the typed IPC seam.
- Main process owns all state; renderer renders snapshots.
- pi JSONL session files are the source of truth for conversation
  content; SQLite stores identity/organization only.
- Files < 1000 LOC hard cap, target < 300.
- No TS parameter properties (Node strip-types).
- CJS main/preload bundles: `__dirname`, never `import.meta.dirname`.
- Svelte 5 runes: declare every `$derived` before any `$effect` /
  `$effect.pre` that reads it. Runes compile to real `const` bindings, so
  reading a later-declared derived inside an effect throws
  `ReferenceError: Cannot access 'X' before initialization` (TDZ) at
  runtime — `tsc` won't catch it.

## Commands

- `pnpm dev` · `pnpm typecheck` · `pnpm test` (unit, node:test)
- `pnpm package` then `pnpm e2e` (Playwright runs the **packaged** app)

## Test lanes (carried from peche-pi)

`tests/core` background-safe UI flows · `tests/live` real providers ·
`tests/native` macOS surfaces · `tests/production` packaged smoke ·
`tests/unit` plain node.
