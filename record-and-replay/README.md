# record-and-replay

A [pi](https://github.com/earendil-works/pi-coding-agent) MCP tool server that records a recurring desktop task on macOS, then synthesizes a reusable **natural-language skill file** the pi agent can execute later.

> This is a standalone **stdio MCP server** (not a pi extension). Register it through [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) so pi launches it as an MCP tool server.

## What it does

1. **Record** — `start_recording` spawns a native macOS helper (Swift) that captures global mouse clicks, keystrokes/typed text, and the **semantic context** of what you interact with: frontmost window title, the clicked element's accessibility title/role/value + ancestor path, the focused element's value and role (via an `AXObserver` — not a 1s poll), app activation/deactivation events, and the URL bar when in a browser. Raw pixel coordinates alone are not enough — the helper resolves them to semantic targets via the macOS Accessibility API. On top of that, it captures a **screenshot of the frontmost window** on every click, non-character keypress, focus change, and end-of-typing-burst (deduped to ≥1.5s) via ScreenCaptureKit, so the synthesizer LLM can actually *see* the workflow — not just read brittle AX labels (Electron apps like Notion often expose none).
2. **Stop → synthesize** — `stop_recording` persists the event stream and returns a compact **digest** + a synthesis system prompt. The running pi agent (your current model) authors the `skill.md` itself — no separate API key.
3. **Store** — generated skills land in `~/.pi/agent/skills/recorded/`, where pi's skill loader discovers them automatically.
4. **Match** — `find_skill(message)` ranks saved skills against a new user message (TF-IDF cosine over `description` + `triggers`, plus exact-keyword boost) and returns the best match above a confidence threshold.
5. **Execute** — `load_skill(name)` injects the skill's steps into the agent as instructions. The skill is a *description of intent*: the agent picks the most robust execution path, in order — (1) programmatic (scripts, APIs, connectors), then (2) web pages via the native `agent_browser` tool, then (3) native desktop UI via the `cua-driver` CLI skill (background native computer use). It only falls back down the list when the path above has no clean route.

## Requirements

- macOS (Apple Silicon or Intel). Capture uses `CGEventTap` + `AXUIElement`.
- Swift toolchain (`swiftc`) — ships with Xcode Command Line Tools.
- Node 22+ (the pi host already provides this).
- **Runtime permissions**, granted to the process that launches this server (i.e. pi / your terminal):
  - **System Settings → Privacy & Security → Accessibility** — required to read window titles + click targets via the Accessibility API.
  - **System Settings → Privacy & Security → Input Monitoring** — required for the `CGEventTap` to see global keystrokes/mouse.
  - **System Settings → Privacy & Security → Screen Recording** — required for `SCScreenshotManager` to capture frontmost-window PNGs. If absent, clicks/keys/focus events are still captured, but each screenshot attempt emits a `SCREENSHOT_FAILED` note into the event stream instead of a PNG — no silent failure.

If permissions are missing, `start_recording` still returns a recording id, and the native helper emits a `PERMISSION_DENIED` note into the event stream and exits — no silent failure.

## Install

From the peach-pi repo root (this package is a pnpm workspace member):

```bash
pnpm --filter peach-pi-record-replay build:native   # compiles native/capture via swiftc
```

Then register the server with pi via pi-mcp-adapter, pointing its command at:

```
node /path/to/peach-pi/record-and-replay/bin/record-replay.mjs
```

(or run `src/server.ts` directly: `node --experimental-strip-types src/server.ts`).

Add to `~/.pi/agent/settings.json` `packages` only if you publish it as a package; for local use, configure it through pi-mcp-adapter's server config.

## Tools

| Tool | Description |
|---|---|
| `start_recording` | Begin capturing. Returns a recording id. Auto-stops at 30 min. |
| `stop_recording` | Stop + persist events. With `skill` body → saves the skill. Without → returns the synthesis prompt + digest for the agent to author. |
| `cancel_recording` | Stop + discard ALL captured data. Nothing persists. |
| `list_recordings` | Show past recordings. |
| `list_skills` | Show synthesized skills. |
| `find_skill` | Match a user message against saved skills; returns best match above threshold. |
| `load_skill` | Return a skill's full content to inject as instructions. |
| `save_skill` | Persist an agent-authored `skill.md` body. |

## Generated `skill.md` shape

```markdown
---
name: <short-kebab-name>
description: <~200 char summary used for auto-matching>
triggers: ["phrase one", "phrase two"]
created: <ISO timestamp>
---

## Overview
<1-2 sentence goal description>

## Prerequisites
<tools, connectors, or permissions needed>

## Workflow
1. <step>

## Notes
<caveats, e.g. "prefer Google Sheets API over browser clicks when available">
```

Files are plain markdown — edit them by hand anytime.

## Storage layout

```
~/.pi/agent/
├─ recordings/
│  ├─ <id>.json           # recording manifest (status, duration, skill link)
│  ├─ <id>.events.ndjson  # raw event stream, one JSON per line
│  └─ <id>.shots/         # captured PNGs (00001.png, 00002.png, …)
└─ skills/recorded/
   └─ <name>.md           # synthesized skill files (pi auto-discovers)
```

## Testing (no permissions needed)

Unit tests cover all pure logic — store round-trips, matcher ranking, digest
compression, the 30-min cap, cancel-discards — and run without the native
binary or any GUI permissions:

```bash
pnpm --filter peach-pi-record-replay test        # node:test, 16 tests
pnpm --filter peach-pi-record-replay typecheck
```

The native binary compiles via `swiftc` (verifiable in CI) but its *runtime*
behavior requires the Privacy permissions above and a GUI session — that's a
manual smoke test on your Mac.

## Limitations / TODO

- Capture is macOS-only (requires `CGEventTap`, `AXUIElement`, `SCScreenshotManager`).
- The URL bar is extracted by a bounded breadth-first AX walk of the front window for browser bundles (Chrome, Safari, Firefox, Edge, Brave, Vivaldi). If a browser reshapes its AX tree the address field may be missed — AX context is still captured.
- **Auto-matching on every new message** + `@skill` / `/skill` routing are pi-harness behaviors, not MCP. This server exposes `find_skill` for the agent to call; wiring it as an automatic pre-message hook is a pi extension follow-up.
- Screenshots are whole-display crops bounded by the front window's reported frame; multi-window or offscreen regions may be clipped. The agent is instructed to batch-read them via `analyze_image` before authoring a skill, mirroring Codex's vision-driven generalization.
