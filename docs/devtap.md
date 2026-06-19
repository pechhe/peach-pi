# DevTap

DevTap is a lightweight, dev-only runtime tap. It lets the coding harness see
what the app actually **does** at runtime — lifecycle, errors, and IPC
activity — instead of only reading source code.

It is **not** an observability platform. v0 is the smallest useful slice that
proves the diagnosis loop end-to-end.

## What gets captured (v0)

| Source | What |
|--------|------|
| Main process | startup/shutdown lifecycle, `uncaughtException`, `unhandledRejection` |
| IPC seam | every `ipcMain.handle` call: `ipc.handle.start` / `.success` / `.error` with channel, duration, sanitized args + result |
| Renderer | `window` errors and unhandled promise rejections (forwarded over the typed IPC seam) |

All events are appended as JSON Lines to `<repoRoot>/.pi/devtap.jsonl`
(gitignored). Each line is one JSON object:

```json
{"ts":"2026-06-17T12:04:21.123Z","level":"info","source":"main","area":"ipc","event":"ipc.handle.success","message":"app:getSnapshot","durationMs":3,"payload":{"channel":"app:getSnapshot"}}
```

Secrets (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`,
`bearer`) are redacted, and large payloads are clamped so the log can't explode.

## Enabling it

DevTap is **off unless `DEV_TAP=1`**. With it unset, the app behaves exactly as
before (no listeners attached, no writes). To run the app with the tap on:

```bash
DEV_TAP=1 pnpm dev
```

The stream is created at `.pi/devtap.jsonl` in the repo root on first event.

## Inspecting the stream

Two readers, same stream:

**In pi (preferred)** — the global DevTap extension registers a `devtap` tool
and `/devtap` command:

```
/devtap status
/devtap tail
/devtap errors
/devtap screenshot      # Electron only — on-demand window capture
/devtap state           # dump live app state
```

**From a shell** — the in-repo script:

```bash
pnpm devtap status            # does a stream exist? how many events / errors?
pnpm devtap tail              # last 50 events (one-line summaries)
pnpm devtap tail --lines 100  # last 100
pnpm devtap tail --full       # include sanitized payloads
pnpm devtap errors            # error-level events only (with stacks)
pnpm devtap clear             # truncate the stream
```

Both parse defensively: malformed lines are skipped and counted, never fatal.

## Screenshots + state (control channel, v1)

When the app runs with `DEV_TAP=1`, a dev-only control channel polls
`.pi/devtap/requests/` for requests dropped by the `devtap` tool:

- `screenshot` → `BrowserWindow.capturePage()` saved to `.pi/devtap/shots/<id>.png`,
  with a `devtap.screenshot` event pointing at the file.
- `state` → emits a `devtap.state` event carrying `appService.snapshot()`.

The control channel is inert unless `DEV_TAP=1` (no poller, no directories).

## The diagnosis loop

1. Start the app with the tap on: `DEV_TAP=1 pnpm dev`.
2. Reproduce the issue in the running app.
3. Inspect runtime evidence: `pnpm devtap errors` and `pnpm devtap tail`.
4. Read the events — failing channel, duration spikes, the actual error/stack.
5. Patch the code.
6. Re-run, reproduce again, and confirm the events/errors changed.

`pnpm devtap clear` between runs keeps the stream focused on one repro.

## In-app install indicator (peach-pi)

The thread header shows a DevTap chip whenever the thread belongs to a project:

- **`◉ DevTap`** — the tap is installed (a `devtap.ts` adapter was found).
- **`Install DevTap`** button — not installed. Clicking it opens a fresh thread
  in that project and prompts the agent to run the `devtap-install` skill.

Detection is via `devtap:projectStatus` (main scans conventional adapter
locations for a module defining `emitDevTapEvent`). The chip re-checks on thread
switch and status change, so it flips once an install finishes.

## Installing across codebases

- **Reader extension (once per machine):** symlink the canonical source into
  pi's global extensions dir, then `/reload`:
  ```bash
  ln -sfn "$(pwd)/devtap/extension" ~/.pi/agent/extensions/devtap
  ```
- **Tap (per repo):** the `devtap-install` skill detects the stack and copies
  the right adapter from `devtap/adapters/` (Electron or Node), wiring the
  entry point + `.gitignore`. Run it via `/skill:devtap-install`.

## Browser / SPA event capture (Vite plugin)

For web SPAs (React, Svelte, SvelteKit, Vue) the Node tap only sees the dev/SSR
process. The **vite-plugin** adapter adds a dev-only browser tap (injected via a
virtual module) that captures client-side runtime events into the same stream:

- `window.error` + `unhandledrejection` (client crashes, hydration errors)
- `console.error`
- failed/slow `fetch` (`fetch.error` / `fetch.fail`)
- SPA route changes (`route.pushState` / `replaceState` / `popstate`)
- client lifecycle (`devtap.client.init`)

Events are batched and POSTed to a `/__devtap` dev-server endpoint, which appends
them to `.pi/devtap.jsonl`. Inert unless `DEV_TAP=1`. **Screenshots/visual state
are not provided** — that's agent-browser's job.

## Intentionally NOT included

- No multi-framework adapters beyond Electron + Node service + browser/Vite.
- No browser-side screenshots/visual capture (use agent-browser).
- No OpenTelemetry, no dashboard, no sockets/websockets.
- No continuous/auto screenshots (on-demand only).
- No heavy dependencies.

## Files

| File | Role |
|------|------|
| `apps/desktop/electron/services/devtap.ts` | tap core (emit, sanitize, error capture, init) |
| `apps/desktop/electron/services/devtap-control.ts` | control channel (screenshot + state) |
| `apps/desktop/electron/ipc/registry.ts` | IPC seam instrumentation |
| `apps/desktop/electron/main.ts` | init + lifecycle + `devtap:report` handler + control wiring |
| `apps/desktop/src/devtap-renderer.ts` | renderer error forwarding (dev only) |
| `packages/shared-types/src/ipc.ts` | `devtap:report` contract |
| `scripts/devtap.mjs` | shell reader (`pnpm devtap`) |
| `devtap/extension/index.ts` | pi DevTap extension (`devtap` tool + `/devtap`) |
| `devtap/skill/adapters/{electron,node-service,vite-plugin}.ts` | tap templates for the installer (Electron / Node / browser-SPA) |
| `devtap/skill/SKILL.md` | `devtap-install` skill |
