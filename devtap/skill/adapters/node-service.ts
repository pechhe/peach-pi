// DevTap adapter — generic Node service (drop into <app>/src/devtap.ts).
//
// Self-contained tap core for a plain Node process: structured JSONL events +
// uncaught error capture. No Electron, no IPC, no screenshots. Enabled only
// when DEV_TAP=1; never throws into the host app.
//
// Wire it once, early in your entry point:
//   import { initDevTapNode, emitDevTapEvent } from "./devtap.ts";
//   initDevTapNode();
//   emitDevTapEvent({ area: "lifecycle", event: "service.start" });
// Then emit around interesting boundaries (requests, jobs, etc.):
//   emitDevTapEvent({ area: "diagnostic", event: "job.done", durationMs: ms, payload: {...} });

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SECRET_KEY = /(pass(word)?|token|secret|api[-_]?key|authorization|cookie|bearer)/i;
const REDACTED = "[redacted]";
const MAX_STRING = 2000;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_ARRAY = 100;
const MAX_DEPTH = 6;

export type DevTapLevel = "info" | "warn" | "error";
export type DevTapArea = "lifecycle" | "error" | "diagnostic";

export interface DevTapEvent {
  level?: DevTapLevel;
  area?: DevTapArea;
  event: string;
  message?: string;
  payload?: unknown;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string };
}

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

export function devTapLogPath(): string {
  if (process.env.DEVTAP_LOG) return process.env.DEVTAP_LOG;
  if (!cachedRoot) cachedRoot = findRepoRoot(process.cwd());
  return join(cachedRoot, ".pi", "devtap.jsonl");
}

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
    if (s && s.length > MAX_PAYLOAD_BYTES) return { truncated: true, bytes: s.length, preview: s.slice(0, 1000) };
  } catch {
    return "[unserializable]";
  }
  return p;
}

let dirEnsured = false;
export function emitDevTapEvent(ev: DevTapEvent): void {
  if (!isDevTapEnabled()) return;
  try {
    const path = devTapLogPath();
    if (!dirEnsured) {
      mkdirSync(dirname(path), { recursive: true });
      dirEnsured = true;
    }
    const rec: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: ev.level ?? "info",
      source: "node",
      area: ev.area ?? "diagnostic",
      event: ev.event,
    };
    if (ev.message) rec.message = ev.message;
    if (ev.durationMs != null) rec.durationMs = ev.durationMs;
    if (ev.error) rec.error = { name: ev.error.name, message: ev.error.message, stack: ev.error.stack?.slice(0, 4000) };
    if (ev.payload !== undefined) rec.payload = capPayload(sanitizePayload(ev.payload));
    appendFileSync(path, `${JSON.stringify(rec)}\n`);
  } catch {
    /* best-effort, never throw */
  }
}

export function captureError(error: unknown, event = "error.uncaught"): void {
  const e = error instanceof Error ? error : new Error(String(error));
  emitDevTapEvent({ level: "error", area: "error", event, message: e.message, error: { name: e.name, message: e.message, stack: e.stack } });
}

let installed = false;
export function initDevTapNode(): void {
  if (!isDevTapEnabled() || installed) return;
  installed = true;
  process.on("uncaughtException", (err) => captureError(err, "error.uncaughtException"));
  process.on("unhandledRejection", (reason) => captureError(reason, "error.unhandledRejection"));
  emitDevTapEvent({ area: "lifecycle", event: "devtap.init", message: "DevTap enabled (node)", payload: { pid: process.pid } });
}
