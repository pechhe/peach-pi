import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { CuaDriverStatus } from "@peach-pi/shared-types";

import { parseDaemonRunning, parsePermission, parseVersion } from "./cua-driver-parse.ts";
import { AsyncTtl } from "./ttl-cache.ts";

export { parseDaemonRunning, parsePermission, parseVersion } from "./cua-driver-parse.ts";

const execFileP = promisify(execFile);

/** Where the bundled SKILL.md is installed so the pi agent discovers the CLI. */
const SKILL_DIR = join(homedir(), ".pi", "agent", "skills", "cua-driver");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
/** Bump when SKILL_BODY changes so the next launch rewrites it. */
const SKILL_VERSION = "002";
/** Standard install location; matches Cua's own installer so TCC grants (keyed
 *  to the `com.trycua.driver` signing identity) survive across Peach Pi and
 *  standalone-driver upgrades alike. */
const INSTALLED_APP = "/Applications/CuaDriver.app";

/**
 * Owns the bundled CuaDriver.app: installs it to /Applications on first run,
 * starts its background daemon (no cursor/focus steal), reports status +
 * permissions, and installs the agent-facing SKILL.md. The driver is the
 * native computer-use backend (ADR-0007); the agent drives it via the
 * `cua-driver` CLI as taught by the skill.
 */
export class CuaDriverService {
  // status() spawns the CLI 3x; the Connectors page re-fires it on every
  // mount. Cache so navigation is instant; cleared after a permission grant.
  private statusCache = new AsyncTtl<CuaDriverStatus>(60_000);

  /** CuaDriver.app shipped inside the package (or repo build dir in dev). */
  private bundledApp(): string {
    return app.isPackaged
      ? join(process.resourcesPath, "CuaDriver.app")
      : join(app.getAppPath(), "build", "cua-driver", "CuaDriver.app");
  }

  /** The app we actually drive: the /Applications copy once installed, else
   *  the bundled one (dev / pre-install). */
  private activeApp(): string {
    if (existsSync(INSTALLED_APP)) return INSTALLED_APP;
    return this.bundledApp();
  }

  private cliPath(): string {
    return join(this.activeApp(), "Contents", "MacOS", "cua-driver");
  }

  /** Best-effort boot: install → start daemon → install skill. Each step is
   *  isolated so a failure (e.g. /Applications not writable) never blocks app
   *  startup; status surfaces the real state to the UI. */
  async init(): Promise<void> {
    await this.ensureInstalled().catch((e) => console.warn("[cua-driver] install:", e?.message));
    await this.startDaemon().catch((e) => console.warn("[cua-driver] daemon:", e?.message));
    await this.installSkill().catch((e) => console.warn("[cua-driver] skill:", e?.message));
  }

  /** Copy the bundled CuaDriver.app to /Applications if absent. `ditto`
   *  preserves the code signature TCC depends on. No-op once installed. */
  async ensureInstalled(): Promise<void> {
    if (process.platform !== "darwin") return;
    if (existsSync(INSTALLED_APP)) return;
    const bundled = this.bundledApp();
    if (!existsSync(bundled)) return; // not vendored (e.g. dev without fetch)
    await execFileP("ditto", [bundled, INSTALLED_APP]);
  }

  /** Launch the driver daemon in the background. `-g` keeps it from stealing
   *  foreground/focus; `serve` runs the long-lived daemon the CLI proxies to.
   *  No-op when one is already running (avoids spawning duplicates). */
  async startDaemon(): Promise<void> {
    if (process.platform !== "darwin") return;
    const appPath = this.activeApp();
    if (!existsSync(appPath)) return;
    if (parseDaemonRunning(await this.run(this.cliPath(), ["status"]))) return;
    await execFileP("open", ["-g", "-a", appPath, "--args", "serve"]);
  }

  async status(): Promise<CuaDriverStatus> {
    return this.statusCache.run(() => this.fetchStatus());
  }

  private async fetchStatus(): Promise<CuaDriverStatus> {
    const installed = existsSync(this.activeApp());
    if (!installed) {
      return { installed: false, version: null, daemonRunning: false, accessibility: "unknown", screenRecording: "unknown" };
    }
    const cli = this.cliPath();
    const version = parseVersion(await this.run(cli, ["--version"]));
    const daemonRunning = parseDaemonRunning(await this.run(cli, ["status"]));
    // `call check_permissions` reports the daemon's grants (authoritative when
    // the daemon is up; CuaDriver.app's TCC identity otherwise).
    const perms = await this.run(cli, ["call", "check_permissions"]);
    return {
      installed: true,
      version,
      daemonRunning,
      accessibility: parsePermission(perms, "Accessibility"),
      screenRecording: parsePermission(perms, "Screen Recording"),
    };
  }

  /** Trigger the macOS permission prompts (interactive). Ensures the daemon is
   *  up (so prompts attribute to CuaDriver.app), then runs the AX + Screen
   *  Recording probes which surface the first-time dialogs. A previously
   *  *denied* grant must be re-enabled manually in System Settings. */
  async grantPermissions(): Promise<void> {
    if (process.platform !== "darwin") return;
    const cli = this.cliPath();
    if (!existsSync(cli)) return;
    await this.startDaemon().catch(() => {});
    void execFileP(cli, ["doctor"]).catch(() => {});
    // The view re-polls status shortly after; ensure that read is fresh.
    this.statusCache.clear();
  }

  /** Run the CLI with a hard timeout, tolerating non-zero exit (status probes
   *  return info on stderr). `check_permissions` can hang indefinitely while
   *  macOS permission prompts are open, so the timeout keeps `status()`
   *  responsive — a timeout surfaces as empty output → "unknown" perms. */
  private async run(bin: string, args: string[], timeoutMs = 6000): Promise<string> {
    try {
      const { stdout, stderr } = await execFileP(bin, args, {
        timeout: timeoutMs,
        maxBuffer: 1 * 1024 * 1024,
      });
      return `${stdout}${stderr}`;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
  }

  /** Install the agent skill if missing or out of date (idempotent). */
  private async installSkill(): Promise<void> {
    await mkdir(SKILL_DIR, { recursive: true });
    let existing = "";
    try {
      existing = await readFile(SKILL_PATH, "utf8");
    } catch {
      existing = "";
    }
    if (existing.includes(`cua-driver-skill v${SKILL_VERSION}`)) return;
    await writeFile(SKILL_PATH, SKILL_BODY, "utf8");
  }
}

const SKILL_BODY = `---
name: cua-driver
description: Background native desktop computer-use via the Cua Driver. Use to control native macOS apps (Finder, Calculator, System Settings, Xcode, native dialogs, menu bar) and anything with no web/API/CLI path — click, type, read accessibility trees, capture window screenshots — all in the background without stealing the cursor or focus. NOT for web pages (use the agent_browser tool). NOT when a programmatic path (CLI/API/connector) exists. This skill pairs with the cua_driver_* toolset registered by the peach-cua-driver extension.
---
<!-- AUTO-INSTALLED by peach-pi (cua-driver-skill v${SKILL_VERSION}). Source: apps/desktop/electron/services/cua-driver-service.ts -->

# cua-driver — background native computer use

Drive native desktop apps in the background. The daemon is already running
(peach-pi starts it). You drive it with the **cua_driver_* tools** (registered by
the peach-cua-driver extension): each tool shells out to the bundled
\`cua-driver\` CLI and returns JSON.

The tools available are:

- \`cua_driver_list_apps\` — find a bundle_id, or a pid + window_id.
- \`cua_driver_launch_app\` — launch a native app hidden (no foreground steal); returns pid + window ids.
- \`cua_driver_get_window_state\` — read a window's AX tree as Markdown (every actionable element tagged \`[element_index N]\`). Set \`capture_mode: "vision"\` to also get a screenshot PNG path you can read with \`analyze_image\`.
- \`cua_driver_click\` — click an element by \`element_index\` (AX RPC, no cursor move) or by screenshot pixel (\`x, y\`).
- \`cua_driver_type_text\` — type text into a pid's focused element (optionally focus an \`element_index\` first).
- \`cua_driver_screenshot\` — capture a window PNG path for \`analyze_image\`.

## When to use this vs other tools

1. **Programmatic first** — if a CLI, script, API, or connector can do the job, use that. Never drive UI for something with a clean API.
2. **Web pages → the native \`agent_browser\` tool** — for websites/web apps (DOM, forms, scraping). Faster and web-native.
3. **Native UI → cua-driver (this skill)** — native macOS apps, system dialogs, permission popups, menu bar, anything with no web/API surface.

Only fall back down the list when the path above has no clean route.

## The loop: launch → inspect → act → verify

Element indexes are re-issued on every snapshot, so always snapshot right before
acting, and snapshot again to verify the result.

1. \`cua_driver_list_apps\` (or \`cua_driver_launch_app\` if not running) → get \`pid\` + \`window_id\`.
2. \`cua_driver_get_window_state\` → AX tree with \`[element_index N]\` tags. Use \`capture_mode: "vision"\` when labels are thin.
3. \`cua_driver_click\` / \`cua_driver_type_text\` by \`element_index\` (from THIS snapshot).
4. \`cua_driver_get_window_state\` again → verify the new state.

## Rules

- **Background contract**: the driver never moves the cursor or steals focus. Keep it that way — do not use foreground automation.
- **Re-snapshot before every action**: element indexes change between snapshots; acting on a stale index hits the wrong element.
- **Verify with screenshots**: when AX labels are thin (Electron apps often expose none), use \`capture_mode: "vision"\` in \`get_window_state\` (or \`cua_driver_screenshot\`) and read the returned PNG path with \`analyze_image\` before claiming success.
- **Permissions**: needs macOS Accessibility + Screen Recording (granted to CuaDriver.app). If calls report a permission error, tell the user to grant them in peach-pi → Connections.
`;
