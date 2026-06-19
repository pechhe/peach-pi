// DevTap adapter — Electron (drop into <app>/electron/services/devtap.ts).
//
// Self-contained tap core for an Electron main process. Enabled only when
// DEV_TAP=1; never throws into the host app. After copying this file, wire it:
//
//   1. main process entry, early in boot:
//        import { initDevTapMain, emitDevTapEvent } from "./services/devtap.ts";
//        initDevTapMain();
//        // emit a lifecycle marker once ready:
//        emitDevTapEvent({ area: "lifecycle", event: "app.ready" });
//
//   2. central IPC seam (wherever you call ipcMain.handle): wrap the handler
//      so each call emits ipc.handle.start/.success/.error. Example:
//        ipcMain.handle(channel, async (_e, ...args) => {
//          if (!isDevTapEnabled()) return handler(...args);
//          const start = performance.now();
//          emitDevTapEvent({ area: "ipc", event: "ipc.handle.start", message: channel, payload: { channel, args } });
//          try {
//            const result = await handler(...args);
//            emitDevTapEvent({ area: "ipc", event: "ipc.handle.success", message: channel,
//              durationMs: Math.round(performance.now() - start), payload: { channel, result } });
//            return result;
//          } catch (err) {
//            captureError(err, { event: "ipc.handle.error", area: "ipc", payload: { channel } });
//            throw err;
//          }
//        });
//
//   3. renderer (optional): forward window 'error'/'unhandledrejection' to main
//      over your IPC bridge, then call emitDevTapEvent from the main handler.

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
    try {
      console.error("[devtap] write failed:", err);
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
/**
 * Install main-process error capture and emit a startup marker.
 * Call once from boot. No-op (and attaches nothing) unless DEV_TAP=1, so
 * production never gains an uncaughtException listener.
 */
export function initDevTapMain(): void {
  if (!isDevTapEnabled() || mainHandlersInstalled) return;
  mainHandlersInstalled = true;
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
