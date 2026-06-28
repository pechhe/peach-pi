// DevTap v0 — dev-only runtime tap.
//
// Gives the coding harness runtime evidence (lifecycle, errors, IPC activity)
// by appending structured JSONL to `<repoRoot>/.pi/devtap.jsonl`. Enabled only
// when DEV_TAP=1, so default production behavior is unchanged. DevTap never
// throws into the host app: all writes are best-effort.
//
// This module is the main/Node-side core. Renderer errors arrive over the
// typed IPC seam (`devtap:report`) and are funneled back through emitDevTapEvent.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SECRET_KEY = /(pass(word)?|token|secret|api[-_]?key|authorization|cookie|bearer)/i;
const REDACTED = "[redacted]";
const MAX_STRING = 2000;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_ARRAY = 100;
const MAX_DEPTH = 6;

export type DevTapLevel = "info" | "warn" | "error";
export type DevTapSource = "main" | "renderer" | "node" | "unknown";
export type DevTapArea = "lifecycle" | "ipc" | "error" | "console" | "diagnostic";

export interface DevTapErrorInfo {
  name: string;
  message: string;
  stack?: string;
}

export interface DevTapEvent {
  level?: DevTapLevel;
  source?: DevTapSource;
  area?: DevTapArea;
  event: string;
  message?: string;
  payload?: unknown;
  durationMs?: number;
  error?: DevTapErrorInfo;
}

/** DevTap only does anything when DEV_TAP=1. Checked live on every call. */
export function isDevTapEnabled(): boolean {
  return process.env.DEV_TAP === "1";
}

let cachedRoot: string | null = null;
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** Absolute path of the JSONL stream. DEVTAP_LOG overrides (used by tests). */
export function devTapLogPath(): string {
  if (process.env.DEVTAP_LOG) return process.env.DEVTAP_LOG;
  if (!cachedRoot) cachedRoot = findRepoRoot(process.cwd());
  return join(cachedRoot, ".pi", "devtap.jsonl");
}

/** Control-channel directories, alongside the stream (under `.pi/devtap/`). */
export function devTapDir(): string {
  return join(dirname(devTapLogPath()), "devtap");
}
export function devTapRequestsDir(): string {
  return join(devTapDir(), "requests");
}
export function devTapShotsDir(): string {
  return join(devTapDir(), "shots");
}

/** Redact obvious secrets and clamp size/depth so the log can't explode. */
export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth-limited]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((v) => sanitizePayload(v, depth + 1));
    if (value.length > MAX_ARRAY) out.push(`…[${value.length - MAX_ARRAY} more]`);
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : sanitizePayload(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function capPayload(p: unknown): unknown {
  try {
    const s = JSON.stringify(p);
    if (s && s.length > MAX_PAYLOAD_BYTES) {
      return { truncated: true, bytes: s.length, preview: s.slice(0, 1000) };
    }
  } catch {
    return "[unserializable]";
  }
  return p;
}

function serialize(ev: DevTapEvent): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: ev.level ?? "info",
    source: ev.source ?? "main",
    area: ev.area ?? "diagnostic",
    event: ev.event,
  };
  if (ev.message) rec.message = ev.message;
  if (ev.durationMs != null) rec.durationMs = ev.durationMs;
  if (ev.error) {
    rec.error = {
      name: ev.error.name,
      message: ev.error.message,
      ...(ev.error.stack ? { stack: ev.error.stack.slice(0, 4000) } : {}),
    };
  }
  if (ev.payload !== undefined) rec.payload = capPayload(sanitizePayload(ev.payload));
  return rec;
}

let dirEnsured = false;
/** Append one JSONL event. No-op unless enabled. Never throws. */
export function emitDevTapEvent(ev: DevTapEvent): void {
  if (!isDevTapEnabled()) return;
  try {
    const path = devTapLogPath();
    if (!dirEnsured) {
      mkdirSync(dirname(path), { recursive: true });
      dirEnsured = true;
    }
    appendFileSync(path, `${JSON.stringify(serialize(ev))}\n`);
  } catch (err) {
    // Best-effort: surface only in dev, never throw into the host app.
    // Use the saved original ref so emitDevTapEvent's failure path never
    // recurses into our wrapped console.error in initDevTapMain().
    try {
      (originalConsoleError ?? console.error)("[devtap] write failed:", err);
    } catch {
      /* ignore */
    }
  }
}

/** Convenience wrapper for error-level events. */
export function captureError(
  error: unknown,
  context?: { event?: string; source?: DevTapSource; area?: DevTapArea; payload?: unknown },
): void {
  const e = error instanceof Error ? error : new Error(String(error));
  emitDevTapEvent({
    level: "error",
    source: context?.source ?? "main",
    area: context?.area ?? "error",
    event: context?.event ?? "error.uncaught",
    message: e.message,
    payload: context?.payload,
    error: { name: e.name, message: e.message, stack: e.stack },
  });
}

let mainHandlersInstalled = false;
let originalConsoleError: typeof console.error | null = null;
let originalConsoleWarn: typeof console.warn | null = null;

/**
 * Install main-process error capture and emit a startup marker.
 * Captures `uncaughtException`, `unhandledRejection`, and `console.error/warn`
 * (most main-process failures surface as console.error inside caught handlers).
 * Call once from boot. No-op (and attaches nothing) unless DEV_TAP=1, so
 * production never gains an uncaughtException listener or console override.
 */
export function initDevTapMain(): void {
  if (!isDevTapEnabled() || mainHandlersInstalled) return;
  mainHandlersInstalled = true;

  // Capture console.error/warn without infinite recursion on emitDevTapEvent's
  // own failure path (which calls the original console.error directly).
  originalConsoleError = console.error;
  originalConsoleWarn = console.warn;
  console.error = (...args: unknown[]): void => {
    captureConsole(args, "error");
    originalConsoleError?.apply(console, args);
  };
  console.warn = (...args: unknown[]): void => {
    captureConsole(args, "warn");
    originalConsoleWarn?.apply(console, args);
  };

  process.on("uncaughtException", (err) =>
    captureError(err, { event: "error.uncaughtException", source: "main" }),
  );
  process.on("unhandledRejection", (reason) =>
    captureError(reason, { event: "error.unhandledRejection", source: "main" }),
  );
  emitDevTapEvent({
    area: "lifecycle",
    event: "devtap.init",
    message: "DevTap enabled (main process)",
    payload: { pid: process.pid, cwd: process.cwd(), log: devTapLogPath() },
  });
}

/** Emit a console-derived event. `originalConsoleError` is the saved ref so
 *  emitDevTapEvent's failure path never recurses into our wrapped console. */
function captureConsole(args: unknown[], level: "error" | "warn"): void {
  // Avoid capturing the tap's own failure logs.
  if (args.length && typeof args[0] === "string" && args[0] === "[devtap]") return;
  let message = "";
  try {
    message = args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
  } catch {
    message = String(args);
  }
  emitDevTapEvent({
    level,
    source: "main",
    area: "console",
    event: `console.${level}`,
    message: message.slice(0, 2000) || undefined,
    payload: { args },
  });
}

/**
 * Attach DevTap capture to a BrowserWindow's webContents. Catches the
 * renderer-process failure signals that `window.error` and Svelte `onError`
 * miss: render-process-gone, unresponsive, crashed, preload load failures,
 * and the renderer console (level + message). Idempotent. No-op unless
 * DEV_TAP=1. Call right after creating each window.
 *
 * Electron types are imported lazily so plain-Node unit tests of the core
 * (which import this module) don't require electron at runtime.
 */
export function attachDevTapToWindow(win: {
  webContents: Electron.WebContents;
}): void {
  if (!isDevTapEnabled()) return;
  const wc = win.webContents as Electron.WebContents & { __devtapAttached?: boolean };
  if (wc.__devtapAttached) return;
  wc.__devtapAttached = true;

  wc.on("console-message", (_e, level, message, line, sourceId) => {
    // Electron console levels: 0=verbose 1=info 2=warning 3=error
    emitDevTapEvent({
      level: level >= 3 ? "error" : level === 2 ? "warn" : "info",
      source: "renderer",
      area: "console",
      event: "renderer.console",
      message: typeof message === "string" ? message.slice(0, 2000) : String(message),
      payload: { level, line, sourceId },
    });
  });
  wc.on("render-process-gone", (_e, details) => {
    captureError(new Error(`render-process-gone: ${details?.reason ?? "unknown"}`), {
      event: "renderer.render-process-gone",
      source: "renderer",
      payload: details,
    });
  });
  wc.on("unresponsive", () => {
    emitDevTapEvent({
      level: "warn",
      source: "renderer",
      area: "diagnostic",
      event: "renderer.unresponsive",
    });
  });
  wc.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    emitDevTapEvent({
      level: "error",
      source: "renderer",
      area: "lifecycle",
      event: "renderer.did-fail-load",
      message: errorDescription ?? `load failed (${errorCode})`,
      payload: { errorCode, errorDescription, validatedURL },
    });
  });
  wc.on("preload-error", (_e, preloadPath, error) => {
    captureError(error, {
      event: "renderer.preload-error",
      source: "renderer",
      payload: { preloadPath },
    });
  });
}
