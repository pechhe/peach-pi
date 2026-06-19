---
name: devtap-install
description: Install DevTap (a dev-only runtime tap) into a codebase so the coding harness can observe how the app actually runs — structured events, errors, IPC activity, and on-demand screenshots/state. Use when the user wants to add DevTap, wire runtime telemetry for diagnosis, or "install the tap".
---

# Install DevTap into a project

DevTap gives the harness runtime evidence instead of only source code. This
skill scaffolds the in-app **tap** for the detected stack. The harness-side
**DevTap extension** (the `devtap` tool + `/devtap` command) is installed once
globally and is NOT part of this skill.

## 0. Prerequisite: the DevTap extension (once per machine)

Confirm the reader extension exists:

```bash
ls ~/.pi/agent/extensions/devtap/index.ts
```

If missing, install it (from this repo's canonical source):

```bash
mkdir -p ~/.pi/agent/extensions
ln -s "$(pwd)/devtap/extension" ~/.pi/agent/extensions/devtap
```

Then `/reload` pi. The `devtap` tool and `/devtap` command become available.

## 1. Detect the stack

- **Electron** if `electron` is in `package.json` deps and there's a main entry
  (`main.ts` / `main.js`) using `app`/`BrowserWindow`. Look for a central IPC
  seam (a single place calling `ipcMain.handle`).
- **Node service** if it's a plain Node process (no Electron, no browser).
- If neither fits cleanly, stop and ask the user.

## 2. Copy the adapter

Adapters are bundled in this skill's own `adapters/` directory (resolve paths
against the directory containing this SKILL.md, so it works for any target
project):

- Electron → copy `<skill dir>/adapters/electron.ts` to `<app>/electron/services/devtap.ts`.
- Node service → copy `<skill dir>/adapters/node-service.ts` to `<app>/src/devtap.ts`.

## 3. Wire the entry point (minimal, dev-only)

Follow the header comment inside the copied adapter.

- **Node**: import and call `initDevTapNode()` at the top of the entry point;
  emit a `lifecycle` event after startup.
- **Electron**: call `initDevTapMain()` early in boot and emit `app.ready`;
  wrap the central `ipcMain.handle` seam (snippet is in the adapter header);
  optionally forward renderer `window` errors over the existing IPC bridge.

Keep every change guarded so production behavior is unchanged when `DEV_TAP`
is unset. Do NOT add an `uncaughtException` listener unconditionally — the
adapter only attaches it when `DEV_TAP=1`.

## 4. Gitignore the stream

Add to `.gitignore`:

```
.pi/devtap.jsonl
.pi/devtap/
```

## 5. Add a convenience script (optional)

If the project lacks a quick reader, the global `devtap` tool already works.
A standalone `pnpm devtap` script can mirror `devtap/../scripts/devtap.mjs`.

## 6. Verify the loop

```bash
DEV_TAP=1 <run the app>      # e.g. DEV_TAP=1 pnpm dev
```

Then in pi: `/devtap status`, `/devtap tail`, `/devtap errors`. For Electron,
`/devtap screenshot` and `/devtap state` exercise the control channel.

Confirm: nothing is written unless `DEV_TAP=1`; at least one lifecycle event
appears; errors are captured.

## Scope

v1 ships Electron + Node adapters only. Other frameworks (Vite SPA, etc.) are
future work — do not invent adapters not present in this skill's `adapters/`.
