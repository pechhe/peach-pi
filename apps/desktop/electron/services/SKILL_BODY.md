---
name: cua-driver
description: Background native desktop computer-use via the Cua Driver. Use to control native macOS apps (Finder, Calculator, System Settings, Xcode, native dialogs, menu bar) and anything with no web/API/CLI path — click, type, read accessibility trees, capture window screenshots — all in the background without stealing the cursor or focus. NOT for web pages (use the agent_browser tool). NOT when a programmatic path (CLI/API/connector) exists. This skill pairs with the cua_driver_* toolset registered by the peach-cua-driver extension.
---
<!-- AUTO-INSTALLED by peach-pi (cua-driver-skill v002). Source: apps/desktop/electron/services/SKILL_BODY.md -->

# cua-driver — background native computer use

Drive native desktop apps in the background. The daemon is already running
(peach-pi starts it). You drive it with the **cua_driver_* tools** (registered by
the peach-cua-driver extension): each tool shells out to the bundled
`cua-driver` CLI and returns JSON.

The tools available are:

- `cua_driver_list_apps` — find a bundle_id, or a pid + window_id.
- `cua_driver_launch_app` — launch a native app hidden (no foreground steal); returns pid + window ids.
- `cua_driver_get_window_state` — read a window's AX tree as Markdown (every actionable element tagged `[element_index N]`). Set `capture_mode: "vision"` to also get a screenshot PNG path you can read with `analyze_image`.
- `cua_driver_click` — click an element by `element_index` (AX RPC, no cursor move) or by screenshot pixel (`x, y`).
- `cua_driver_type_text` — type text into a pid's focused element (optionally focus an `element_index` first).
- `cua_driver_screenshot` — capture a window PNG path for `analyze_image`.

## When to use this vs other tools

1. **Programmatic first** — if a CLI, script, API, or connector can do the job, use that. Never drive UI for something with a clean API.
2. **Web pages → the native `agent_browser` tool** — for websites/web apps (DOM, forms, scraping). Faster and web-native.
3. **Native UI → cua-driver (this skill)** — native macOS apps, system dialogs, permission popups, menu bar, anything with no web/API surface.

Only fall back down the list when the path above has no clean route.

## The loop: launch → inspect → act → verify

Element indexes are re-issued on every snapshot, so always snapshot right before
acting, and snapshot again to verify the result.

1. `cua_driver_list_apps` (or `cua_driver_launch_app` if not running) → get `pid` + `window_id`.
2. `cua_driver_get_window_state` → AX tree with `[element_index N]` tags. Use `capture_mode: "vision"` when labels are thin.
3. `cua_driver_click` / `cua_driver_type_text` by `element_index` (from THIS snapshot).
4. `cua_driver_get_window_state` again → verify the new state.

## Rules

- **Background contract**: the driver never moves the cursor or steals focus. Keep it that way — do not use foreground automation.
- **Re-snapshot before every action**: element indexes change between snapshots; acting on a stale index hits the wrong element.
- **Verify with screenshots**: when AX labels are thin (Electron apps often expose none), use `capture_mode: "vision"` in `get_window_state` (or `cua_driver_screenshot`) and read the returned PNG path with `analyze_image` before claiming success.
- **Permissions**: needs macOS Accessibility + Screen Recording (granted to CuaDriver.app). If calls report a permission error, tell the user to grant them in peach-pi → Connections.
