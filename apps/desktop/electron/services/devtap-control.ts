// DevTap control channel (v1) — interactive screenshot + state capture.
//
// The harness drops a request file in `.pi/devtap/requests/<id>.json`; this
// poller (dev-only, started only when DEV_TAP=1) executes it and emits a result
// event into the JSONL stream (screenshots also land in `.pi/devtap/shots/`).
// Electron is imported lazily so this module stays importable in plain Node.

import { mkdirSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  devTapRequestsDir,
  devTapShotsDir,
  emitDevTapEvent,
  isDevTapEnabled,
} from "./devtap.ts";

interface ControlRequest {
  id: string;
  cmd: "screenshot" | "state";
}

type StateProvider = () => unknown;
let stateProvider: StateProvider | null = null;

/** Register the live app-state snapshot source (e.g. appService.snapshot()). */
export function setDevTapStateProvider(fn: StateProvider): void {
  stateProvider = fn;
}

async function handleRequest(req: ControlRequest): Promise<void> {
  if (req.cmd === "screenshot") {
    const { BrowserWindow } = await import("electron");
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) {
      emitDevTapEvent({
        level: "warn",
        area: "diagnostic",
        event: "devtap.screenshot.error",
        message: "no window to capture",
        payload: { requestId: req.id },
      });
      return;
    }
    const image = await win.capturePage();
    mkdirSync(devTapShotsDir(), { recursive: true });
    const file = join(devTapShotsDir(), `${req.id}.png`);
    writeFileSync(file, image.toPNG());
    emitDevTapEvent({
      area: "diagnostic",
      event: "devtap.screenshot",
      message: "screenshot captured",
      payload: { requestId: req.id, file, bounds: win.getBounds() },
    });
    return;
  }
  if (req.cmd === "state") {
    emitDevTapEvent({
      area: "diagnostic",
      event: "devtap.state",
      message: stateProvider ? "state captured" : "no state provider registered",
      payload: { requestId: req.id, state: stateProvider ? stateProvider() : null },
    });
  }
}

let watcher: ReturnType<typeof watch> | null = null;

/** Drain pending request files from the requests dir. Each file is read +
 *  removed before dispatch so an inotify/firehose burst never reprocesses the
 *  same request. The directory scan itself only runs when the watcher fires. */
function drainRequests(): void {
  let files: string[];
  try {
    files = readdirSync(devTapRequestsDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    const full = join(devTapRequestsDir(), f);
    let req: ControlRequest | null = null;
    try {
      req = JSON.parse(readFileSync(full, "utf8")) as ControlRequest;
    } catch {
      // ignore malformed request
    }
    try {
      rmSync(full);
    } catch {
      /* already gone */
    }
    if (!req?.id || (req.cmd !== "screenshot" && req.cmd !== "state")) continue;
    void handleRequest(req).catch((err) =>
      emitDevTapEvent({
        level: "error",
        area: "error",
        event: "devtap.control.error",
        message: String(err),
        payload: { requestId: req?.id },
      }),
    );
  }
}

/** Watch the requests dir for new control requests. No-op unless DEV_TAP=1.
 *  Replaces the prior 300ms setInterval readdir+readFileSync poll so the main
 *  process does no periodic FS work when idle. */
export function startDevTapControlChannel(): void {
  if (!isDevTapEnabled() || watcher) return;
  mkdirSync(devTapRequestsDir(), { recursive: true });
  emitDevTapEvent({
    area: "lifecycle",
    event: "devtap.control.start",
    message: "control channel watching",
    payload: { dir: devTapRequestsDir() },
  });
  // Drain once for any request dropped before the watcher attached, then react
  // to create/rename events. fs.watch can fire several events per change and
  // may emit only "rename" on some platforms; drainRequests is idempotent
  // (rmSync before dispatch) so redundant firings are safe.
  drainRequests();
  try {
    watcher = watch(devTapRequestsDir(), (event) => {
      if (event === "rename" || event === "change") drainRequests();
    });
  } catch {
    // Watcher setup failed (e.g. dir removed mid-init): fall back to no-op;
    // control requests just won't be serviced until next start. Retry would
    // be handled by a future restart of the channel. Logged via emit.
    emitDevTapEvent({
      level: "warn",
      area: "diagnostic",
      event: "devtap.control.watch.error",
      message: "could not watch requests dir",
      payload: { dir: devTapRequestsDir() },
    });
    return;
  }
  watcher.unref?.();
}

export function stopDevTapControlChannel(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
