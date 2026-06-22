/**
 * Capture host. Spawns the native Swift helper, parses its NDJSON event
 * stream line-by-line, persists events to the recording log, and enforces the
 * 30-minute cap + cancellation. Pure logic is split out (processLine, isDue)
 * so it is unit-testable without spawning a subprocess.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import {dirname, join} from "node:path";
import { fileURLToPath } from "node:url";
import type { RecordEvent } from "./types.ts";
import { MAX_DURATION_MS, type Recording } from "./types.ts";
import { appendEvent, discardRecording, loadRecording, saveRecording, recordingsDir } from "./store.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the compiled capture binary. Resolution order:
 *  1. `RECORDER_CAPTURE_BIN` env override (explicit).
 *  2. `native/capture` next to this module (dev / `pnpm build:native`).
 *  3. Packaged-app resources candidates (see `CANDIDATE_PACKAGED`). */
export function captureBinPath(): string {
  if (process.env.RECORDER_CAPTURE_BIN) return process.env.RECORDER_CAPTURE_BIN;
  const here = join(__dirname, "..", "native", "capture");
  if (existsSync(here)) return here;
  for (const c of CANDIDATE_PACKAGED) {
    if (existsSync(c)) return c;
  }
  return here; // last resort; caller checks existsSync
}

/** Candidate absolute paths when shipped inside a packaged macOS app's
 *  Resources dir. Extended if the binary is bundled under a known name. */
const CANDIDATE_PACKAGED = [
  // When the main process runs from the .app bundle, __dirname is under
  // out/...; place the binary alongside via the build step (TODO).
  join(__dirname, "..", "..", "native", "capture"),
  join(homedir(), ".pi", "agent", "record-replay", "capture"),
];

/** Validate + normalize one NDJSON line from the native helper. */
export function processLine(line: string): RecordEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const e = obj as Partial<RecordEvent>;
  if (typeof e.t !== "number" || typeof e.type !== "string" || typeof e.ts !== "string") return null;
  if (!e.payload || typeof e.payload !== "object") return null;
  return { t: e.t, ts: e.ts, type: e.type, payload: e.payload as RecordEvent["payload"] };
}

export interface ActiveCapture {
  root: string;
  id: string;
  proc: ChildProcess | null;
  timeout: NodeJS.Timeout | null;
  aborted: boolean;
}

export function startCapture(
  root: string,
  id: string,
  binPath = captureBinPath(),
  onEvent?: (e: RecordEvent) => void,
): ActiveCapture {
  const startedAt = new Date().toISOString();
  saveRecording(root, {
    id, startedAt, stoppedAt: null, durationMs: 0, eventCount: 0,
    status: "active", eventsPath: "", skillPath: null, digest: null,
  });

  if (!existsSync(binPath)) {
    // Capture binary missing — recording is still created (e.g. for dry-run /
    // tests). stop_recording will report the missing binary.
    return { root, id, proc: null, timeout: null, aborted: false };
  }

  const proc = spawn(binPath, [id, recordingsDir(root)], { stdio: ["pipe", "pipe", "inherit"] });

  proc.stdout?.setEncoding("utf8");
  let buf = "";
  proc.stdout?.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const evt = processLine(line);
      if (evt) {
        appendEvent(root, id, JSON.stringify(evt));
        onEvent?.(evt);
      }
    }
  });

  const timeout = setTimeout(() => stopCapture(root, id, "timeout"), MAX_DURATION_MS);

  return { root, id, proc, timeout, aborted: false };
}

export function stopCapture(
  root: string,
  id: string,
  reason: "stop" | "timeout" | "cancel" = "stop",
): { rec: ReturnType<typeof loadRecording> } {
  const rec = loadRecording(root, id);
  if (!rec) return { rec: null };

  if (reason === "cancel") {
    discardRecording(root, id);
    return { rec: { ...rec, status: "cancelled" } };
  }

  const stoppedAt = new Date().toISOString();
  const durationMs = new Date(stoppedAt).getTime() - new Date(rec.startedAt).getTime();
  const finalStatus: Recording["status"] = reason === "timeout" ? "timeout" : "stopped";

  // Settle the native process if still alive.
  // (Caller resolves the deferred proc/timeout from ActiveCapture.)

  const updated: Recording = {
    ...rec,
    stoppedAt,
    durationMs,
    status: finalStatus,
  };
  saveRecording(root, updated);
  return { rec: updated };
}

/** Kill the native process + clear the timeout. Safe to call multiple times. */
export function killCapture(active: ActiveCapture): void {
  if (active.timeout) {
    clearTimeout(active.timeout);
    active.timeout = null;
  }
  if (active.proc && !active.proc.killed) {
    active.proc.kill("SIGTERM");
    active.proc = null;
  }
}

export { MAX_DURATION_MS, discardRecording, rmSync };
