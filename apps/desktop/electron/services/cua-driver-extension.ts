import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Installs the `peach-cua-driver` pi extension into the global auto-discovered
 * location (`~/.pi/agent/extensions/`). It registers a focused set of native
 * computer-use tools that shell out to the bundled `cua-driver` CLI (driving
 * the background CuaDriver.app daemon — ADR-0007).
 *
 * Self-contained: the extension spawns the local CLI directly. Unlike the
 * connectors extension there is no secret to protect (the driver is a pure
 * local accessibility tool, no API keys), so no peach-pi localhost bridge is
 * needed. The CLI path is resolved at call time: /Applications install first,
 * then the `PEACH_PI_CUA_DRIVER_BIN` override, then a clear error.
 *
 * The extension source is embedded here (not a packaged asset) so packaging
 * stays simple. We only rewrite the file when our VERSION marker changes.
 */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-cua-driver.ts");
const VERSION = "003";

// NOTE: no backticks / no ${} inside this string — keeps embedding clean.
// Plain TS, run by pi's strip-types loader. Uses @sinclair/typebox for schemas
// (available to pi extensions) so tools get typed, validated parameters.
const EXTENSION_SOURCE = [
  "// AUTO-INSTALLED by peach-pi (peach-cua-driver v" + VERSION + ").",
  "// Source: apps/desktop/electron/services/cua-driver-extension.ts",
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
  "    description: \"Walk a running app's accessibility tree and return it as Markdown, tagging every actionable element with [element_index N]. Always call this BEFORE click/type_text so your element_index is fresh, and call it again after to verify the result. Set capture_mode to \\\"vision\\\" to also capture a screenshot PNG (path returned) you can read with analyze_image when element labels are missing or ambiguous.\",",
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
  "    description: \"Left-click an element in a native macOS app. Two modes: (1) element_index + window_id — pure AX RPC, works on backgrounded/hidden windows, no cursor move or focus steal. Requires a prior cua_driver_get_window_state on this (pid, window_id) this turn. (2) x, y in window-local screenshot pixels (top-left origin of the PNG get_window_state returns) — synthesized mouse events, AX never consulted. Prefer element_index when AX exposes the target; fall back to pixels for things AX can't see.\",",
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
  "    description: \"Insert text at the target process's cursor. Optionally focus an element_index first (needs a prior cua_driver_get_window_state + window_id). Background-safe — no focus steal.\",",
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
  "    description: \"Capture a PNG screenshot of a window and return its path. Pass the path to analyze_image to read what's on screen — use this when the AX tree from get_window_state is thin or ambiguous (Electron apps, custom-drawn UI). Prefer get_window_state with capture_mode=vision to inspect + screenshot in one call.\",",
  "    parameters: Type.Object({",
  "      window_id: Type.Integer({ description: \"CGWindowID of the window to capture (from list_apps / launch_app / get_window_state).\" }),",
  "    }),",
  "    async execute(_id, params): Promise<ToolOut> {",
  "      return callDriver(\"screenshot\", { window_id: params.window_id }, true);",
  "    },",
  "  });",
  "}",
].join("\n");

/** Write the extension if missing or out of date. Safe to call on every launch. */
export async function ensureCuaDriverExtension(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true });
  let existing = "";
  try {
    existing = await readFile(EXTENSION_PATH, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("peach-cua-driver v" + VERSION)) return;
  await writeFile(EXTENSION_PATH, EXTENSION_SOURCE, "utf8");
}
