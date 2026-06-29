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
import skillBody from "./SKILL_BODY.md?raw";

const execFileP = promisify(execFile);

/** Where the bundled SKILL.md is installed so the pi agent discovers the CLI. */
const SKILL_DIR = join(homedir(), ".pi", "agent", "skills", "cua-driver");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
/** Bump when SKILL_BODY.md changes so the next launch rewrites it. */
const SKILL_VERSION = "002";
/** Where the peach-cua-driver extension is auto-discovered by pi. */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-cua-driver.ts");
/** Bump when EXTENSION_SOURCE changes so the next launch rewrites it. */
const EXTENSION_VERSION = "003";
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

  /** Best-effort boot: install → start daemon → install skill → install
   *  extension. Each step is isolated so a failure (e.g. /Applications not
   *  writable) never blocks app startup; status surfaces the real state to
   *  the UI. */
  async init(): Promise<void> {
    await this.ensureInstalled().catch((e) => console.warn("[cua-driver] install:", e?.message));
    await this.startDaemon().catch((e) => console.warn("[cua-driver] daemon:", e?.message));
    await this.installSkill().catch((e) => console.warn("[cua-driver] skill:", e?.message));
    await this.ensureExtension().catch((e) => console.warn("[cua-driver] extension:", e?.message));
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

  /** Install the agent skill if missing or out of date (idempotent). The
   *  body lives in SKILL_BODY.md (a real file asset) so it is editable as
   *  markdown, not a string constant; read at install time via the Vite
   *  `?raw` import. */
  private async installSkill(): Promise<void> {
    await mkdir(SKILL_DIR, { recursive: true });
    let existing = "";
    try {
      existing = await readFile(SKILL_PATH, "utf8");
    } catch {
      existing = "";
    }
    if (existing.includes(`cua-driver-skill v${SKILL_VERSION}`)) return;
    await writeFile(SKILL_PATH, skillBody, "utf8");
  }

  /** Install the `peach-cua-driver` pi extension (~/.pi/agent/extensions/)
   *  that registers the cua_driver_* tools. The extension spawns the local
   *  `cua-driver` CLI directly — no peach-pi bridge needed (it is a pure
   *  local accessibility tool with no API key to protect). The source is
   *  embedded here (not a packaged asset) so packaging stays simple; we
   *  only rewrite the file when EXTENSION_VERSION changes. */
  private async ensureExtension(): Promise<void> {
    await mkdir(EXTENSIONS_DIR, { recursive: true });
    let existing = "";
    try {
      existing = await readFile(EXTENSION_PATH, "utf8");
    } catch {
      existing = "";
    }
    if (existing.includes(`peach-cua-driver v${EXTENSION_VERSION}`)) return;
    await writeFile(EXTENSION_PATH, EXTENSION_SOURCE, "utf8");
  }
}

const EXTENSION_SOURCE = [
  "// AUTO-INSTALLED by peach-pi (peach-cua-driver v" + EXTENSION_VERSION + ").",
  "// Source: apps/desktop/electron/services/cua-driver-service.ts",
  'import { execFile } from "node:child_process";',
  'import { existsSync } from "node:fs";',
  'import { mkdtemp, readFile, rm } from "node:fs/promises";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { promisify } from "node:util";',
  'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
  'import { Type } from "typebox";',
  "",
  "const execFileP = promisify(execFile);",
  "",
  "// /Applications install (CuaDriverService.ensureInstalled) is the default;",
  "// PEACH_PI_CUA_DRIVER_BIN lets dev/test point elsewhere.",
  "function cliPath(): string | null {",
  "  const inst = \"/Applications/CuaDriver.app/Contents/MacOS/cua-driver\";",
  "  if (existsSync(inst)) return inst;",
  "  if (process.env.PEACH_PI_CUA_DRIVER_BIN && existsSync(process.env.PEACH_PI_CUA_DRIVER_BIN)) {",
  "    return process.env.PEACH_PI_CUA_DRIVER_BIN;",
  "  }",
  "  return null;",
  "}",
  "",
  "type ToolOut = { content: { type: \"text\"; text: string }[]; details: Record<string, unknown> };",
  "",
  "function txt(text: string) {",
  "  return { type: \"text\" as const, text };",
  "}",
  "",
  "// Run `cua-driver call <tool> <json>`. Writes any screenshot to a temp file",
  "// (when screenshot_out_file is requested) and returns that path so the agent",
  "// can pass it to analyze_image.",
  "async function callDriver(tool: string, args: Record<string, unknown>, screenshot = false): Promise<ToolOut> {",
  "  const cli = cliPath();",
  "  if (!cli) {",
  "    return { content: [txt(\"Cua Driver is not installed. Start the peach-pi app (it installs CuaDriver.app to /Applications on first run) or run scripts/fetch-cua-driver.mjs, then retry.\")], details: {} };",
  "  }",
  "  let outFile: string | null = null;",
  "  const cliArgs = [\"call\", tool];",
  "  if (Object.keys(args).length > 0) cliArgs.push(JSON.stringify(args));",
  "  if (screenshot) {",
  "    const dir = await mkdtemp(join(tmpdir(), \"cua-\" + tool + \"-\"));",
  "    outFile = join(dir, \"shot.png\");",
  "    cliArgs.push(\"--screenshot-out-file\", outFile);",
  "  }",
  "  try {",
  "    const { stdout, stderr } = await execFileP(cli, cliArgs, { maxBuffer: 32 * 1024 * 1024 });",
  "    let text = stdout.trim();",
  "    if (outFile && existsSync(outFile)) text = text + \"\\n\\nScreenshot saved to: \" + outFile;",
  "    if (stderr.trim()) text = text + \"\\n\\n(stderr) \" + stderr.trim();",
  "    return { content: [txt(text || \"(no output)\")], details: { tool, screenshotPath: outFile } };",
  "  } catch (err) {",
  "    const e = err as { stdout?: string; stderr?: string; message?: string };",
  "    const parts = [e.stdout, e.stderr, e.message].filter(Boolean).map(String);",
  "    return { content: [txt(\"cua-driver call failed: \" + parts.join(\"\\n\"))], details: { tool, error: true } };",
  "  }",
  "}",
  "",
  "export default function (pi: ExtensionAPI) {",
  "  // 1. List macOS apps — running + installed-but-not-running. Use to find a",
  "  // bundle_id before launch_app, or a pid+window_id for further calls.",
  "  pi.registerTool({",
  "    name: \"cua_driver_list_apps\",",
  "    label: \"List native macOS apps\",",
  "    description: \"List macOS apps — both currently running and installed — with per-app state (running, active) and, when running, the pid + window ids. Use this to find a bundle_id before cua_driver_launch_app, or a pid/window_id for cua_driver_get_window_state / click.\",",
  "    parameters: Type.Object({",
  "      running: Type.Optional(Type.Boolean({ description: \"Filter to running apps only.\" })),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      const args: Record<string, unknown> = {};",
  "      if (params.running !== undefined) args.running = params.running;",
  "      return callDriver(\"list_apps\", args);",
  "    },",
  "  });",
  "",
  "  // 2. Launch a native app hidden. The driver never brings it to the",
  "  // foreground — pure background automation. Returns pid + window ids.",
  "  pi.registerTool({",
  "    name: \"cua_driver_launch_app\",",
  "    label: \"Launch a native app\",",
  "    description: \"Launch a macOS app hidden (background, no foreground/focus steal). Returns the pid and the app's window ids. Use cua_driver_get_window_state next to read the window's AX tree + element indexes.\",",
  "    parameters: Type.Object({",
  "      bundle_id: Type.String({ description: \"macOS bundle id, e.g. \\\"com.apple.calculator\\\" or \\\"com.apple.finder\\\".\" }),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      return callDriver(\"launch_app\", { bundle_id: params.bundle_id });",
  "    },",
  "  });",
  "",
  "  // 3. Inspect a window: AX tree as Markdown, every actionable element tagged",
  "  // [element_index N]. capture_mode \"vision\" also writes a screenshot PNG",
  "  // (path returned) for analyze_image when AX labels are thin.",
  "  pi.registerTool({",
  "    name: \"cua_driver_get_window_state\",",
  "    label: \"Inspect a native window\",",
  "    description: \"Walk a running app's accessibility tree and return it as Markdown, tagging every actionable element with [element_index N]. Always call this BEFORE click/type_text so your element_index is fresh, and call it again after to verify the result. Set capture_mode to \\\"vision\\\" to also capture a screenshot PNG (path returned) you can read with analyze_image when element labels are missing or ambiguous.\"",
  "    parameters: Type.Object({",
  "      pid: Type.Integer({ description: \"Target process id (from list_apps or launch_app).\" }),",
  "      window_id: Type.Integer({ description: \"CGWindowID of the window to inspect (from list_apps / launch_app).\" }),",
  // NOTE: keep this Union on one line. jiti 2.7.0 oxc-parser mis-parses a
  // multi-line Union literal whose description contains escaped double-quotes
  // (see peach-cua-driver ParseError 106:4). Single-line form parses cleanly.
  "      capture_mode: Type.Optional(Type.Union([Type.Literal(\"som\"), Type.Literal(\"vision\"), Type.Literal(\"none\")], { description: \"Screenshot capture. \\\"som\\\" (default) uses ScreenCaptureKit; \\\"vision\\\" also returns the PNG path; \\\"none\\\" skips it.\" })),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      const args: Record<string, unknown> = { pid: params.pid, window_id: params.window_id };",
  "      if (params.capture_mode) args.capture_mode = params.capture_mode;",
  "      // vision/none map to a screenshot file the agent can analyze_image.",
  "      const wantShot = params.capture_mode !== \"none\";",
  "      return callDriver(\"get_window_state\", args, wantShot);",
  "    },",
  "  });",
  "",
  "  // 4. Click an element by element_index (AX RPC, no cursor move) or by",
  "  // screenshot pixel (x, y). element_index needs a prior get_window_state.",
  "  pi.registerTool({",
  "    name: \"cua_driver_click\",",
  "    label: \"Click a native element\",",
  "    description: \"Left-click an element in a native macOS app. Two modes: (1) element_index + window_id — pure AX RPC, works on backgrounded/hidden windows, no cursor move or focus steal. Requires a prior cua_driver_get_window_state on this (pid, window_id) this turn. (2) x, y in window-local screenshot pixels (top-left origin of the PNG get_window_state returns) — synthesized mouse events, AX never consulted. Prefer element_index when AX exposes the target; fall back to pixels for things AX can't see.\"",
  "    parameters: Type.Object({",
  "      pid: Type.Integer({ description: \"Target process id.\" }),",
  "      window_id: Type.Optional(Type.Integer({ description: \"Window id whose last get_window_state produced element_index. Required for element_index mode.\" })),",
  "      element_index: Type.Optional(Type.Integer({ description: \"Element index from the last get_window_state for this (pid, window_id).\" })),",
  "      x: Type.Optional(Type.Number({ description: \"X in window-local screenshot pixels (with y). Pixel mode.\" })),",
  "      y: Type.Optional(Type.Number({ description: \"Y in window-local screenshot pixels (with x). Pixel mode.\" })),",
  "      action: Type.Optional(Type.String({ description: \"AX action: press (default), show_menu, pick, confirm, cancel, open.\" })),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      const args: Record<string, unknown> = { pid: params.pid };",
  "      if (params.window_id !== undefined) args.window_id = params.window_id;",
  "      if (params.element_index !== undefined) args.element_index = params.element_index;",
  "      if (params.x !== undefined) args.x = params.x;",
  "      if (params.y !== undefined) args.y = params.y;",
  "      if (params.action) args.action = params.action;",
  "      return callDriver(\"click\", args);",
  "    },",
  "  });",
  "",
  "  // 5. Type text into a pid's focused element (or focus an element_index first).",
  "  pi.registerTool({",
  "    name: \"cua_driver_type_text\",",
  "    label: \"Type into a native element\",",
  "    description: \"Insert text at the target process's cursor. Optionally focus an element_index first (needs a prior cua_driver_get_window_state + window_id). Background-safe — no focus steal.\"",
  "    parameters: Type.Object({",
  "      pid: Type.Integer({ description: \"Target process id.\" }),",
  "      text: Type.String({ description: \"Text to insert at the target's cursor.\" }),",
  "      window_id: Type.Optional(Type.Integer({ description: \"Window id for element_index focus.\" })),",
  "      element_index: Type.Optional(Type.Integer({ description: \"Focus this element before typing (needs window_id).\" })),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      const args: Record<string, unknown> = { pid: params.pid, text: params.text };",
  "      if (params.window_id !== undefined) args.window_id = params.window_id;",
  "      if (params.element_index !== undefined) args.element_index = params.element_index;",
  "      return callDriver(\"type_text\", args);",
  "    },",
  "  });",
  "",
  "  // 6. Capture a screenshot of a window for analyze_image. Use when an AX",
  "  // tree alone can't disambiguate what's on screen (Electron apps, custom UI).",
  "  pi.registerTool({",
  "    name: \"cua_driver_screenshot\",",
  "    label: \"Screenshot a native window\",",
  "    description: \"Capture a PNG screenshot of a window and return its path. Pass the path to analyze_image to read what's on screen — use this when the AX tree from get_window_state is thin or ambiguous (Electron apps, custom-drawn UI). Prefer get_window_state with capture_mode=vision to inspect + screenshot in one call.\"",
  "    parameters: Type.Object({",
  "      window_id: Type.Integer({ description: \"CGWindowID of the window to capture (from list_apps / launch_app / get_window_state).\" }),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      return callDriver(\"screenshot\", { window_id: params.window_id }, true);",
  "    },",
  "  });",
  "}",
].join("\n");