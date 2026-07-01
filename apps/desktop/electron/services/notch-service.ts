import { app } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ThreadId } from "@peach-pi/shared-types";
import type { AppService } from "./app-service.ts";
import type { ThreadService } from "./thread-service.ts";
import type { HudLifecycle } from "../hud-lifecycle.ts";
import type { Emit } from "../ipc/registry.ts";
import {
  computeNotchState,
  isNotchFinish,
  reduceInbox,
  type NotchThread,
} from "./notch-state.ts";

/** main → helper: full surface state (running + unread finished session lists). */
type StateMsg = { type: "state"; running: NotchThread[]; completed: NotchThread[] };
/** main → helper: a run just finished cleanly → pop a toast out of the notch. */
type FinishMsg = { type: "finish" } & NotchThread;
/** helper → main: the user clicked a finished thread → open it. */
type OpenMsg = { type: "open"; id: string };

/**
 * Owns the native Notch helper (ADR-0016). Spawns the bundled `notch-helper`
 * binary, subscribes to `ThreadService`'s frame bus, pushes state/finish frames
 * to its stdin as NDJSON, and turns click frames from its stdout into a
 * focus-thread + show-main-window. The routing/inbox logic is the pure
 * `notch-state` reducer; this class only reads Electron globals and shuttles
 * NDJSON, mirroring `finish-cue-router` + `cua-driver-service`.
 *
 * The helper is optional: a checkout that has not built the Swift binary simply
 * runs without a notch (start() logs and no-ops).
 */
export class NotchService {
  private child: ChildProcessByStdio<Writable, Readable, null> | null = null;
  private unread: ReadonlySet<ThreadId> = new Set();
  private stdoutBuf = "";
  private disposeSub: (() => void) | null = null;

  constructor(
    private readonly deps: {
      threadService: ThreadService;
      appService: AppService;
      emit: Emit;
      hud: HudLifecycle;
    },
  ) {}

  /** The bundled `notch-helper` binary (packaged) or the SwiftPM build output
   *  (dev). Mirrors `CuaDriverService.bundledApp()`. */
  private helperBinary(): string {
    return app.isPackaged
      ? join(process.resourcesPath, "notch-helper")
      : join(app.getAppPath(), "native", "notch", ".build", "release", "notch-helper");
  }

  start(): void {
    const bin = this.helperBinary();
    if (!existsSync(bin)) {
      console.warn(`[notch] helper binary missing, notch disabled: ${bin}`);
      return;
    }
    const child = spawn(bin, [], { stdio: ["pipe", "pipe", "inherit"] });
    this.child = child;
    child.on("error", (err) => console.warn(`[notch] helper error: ${String(err)}`));
    child.on("exit", () => {
      this.child = null;
    });
    child.stdout.on("data", (b: Buffer) => this.onStdout(b));

    // Opening a finished thread in the app (not just via the notch) clears its
    // unread accent — mirror that here so the notch notification disappears too.
    this.deps.appService.onThreadSeen((id) => this.markOpened(id as ThreadId));

    this.disposeSub = this.deps.threadService.subscribe((frame) => {
      if (frame.kind !== "status") return;
      this.unread = reduceInbox(this.unread, frame.threadId, frame.status, frame.prev);
      if (isNotchFinish(frame.status, frame.prev)) {
        const t = this.thread(frame.threadId);
        if (t) this.send({ type: "finish", id: t.id, title: t.title });
      }
      this.publish();
    });
    this.publish();
  }

  private thread(id: ThreadId): NotchThread | null {
    const t = this.deps.appService.snapshot().threads.find((x) => x.id === id);
    return t ? { id: t.id, title: t.title } : null;
  }

  /** Recompute + push the full surface state from the live snapshot + inbox. */
  private publish(): void {
    const { threads } = this.deps.appService.snapshot();
    const state = computeNotchState(threads, this.unread);
    this.send({ type: "state", running: state.running, completed: state.completed });
  }

  private send(msg: StateMsg | FinishMsg): void {
    if (!this.child || !this.child.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private onStdout(buf: Buffer): void {
    this.stdoutBuf += buf.toString("utf8");
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf("\n")) >= 0) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (!line) continue;
      try {
        this.handle(JSON.parse(line) as OpenMsg);
      } catch {
        // A malformed line from the helper must never break the host.
      }
    }
  }

  private handle(msg: OpenMsg): void {
    if (msg?.type !== "open" || typeof msg.id !== "string") return;
    const id = msg.id as ThreadId;
    this.markOpened(id);
    this.deps.hud.showMainWindow();
    this.deps.emit("event:focusThread", id);
  }

  /** Drop a thread from the unread inbox + re-publish. Triggered both by a
   *  notch row click and by the app opening the thread (`onThreadSeen`), so the
   *  notification clears whichever way the user reaches the thread. */
  private markOpened(id: ThreadId): void {
    if (!this.unread.has(id)) return;
    const next = new Set(this.unread);
    next.delete(id);
    this.unread = next;
    this.publish();
  }

  dispose(): void {
    this.disposeSub?.();
    this.disposeSub = null;
    this.child?.kill();
    this.child = null;
  }
}
