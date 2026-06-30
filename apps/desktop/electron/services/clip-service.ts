/**
 * ClipService — owns the live "clip" capture in the main process. Reuses the
 * record-and-replay native helper for screen frames + window context, then
 * projects the result into an agent-readable clip artifact (frames + metadata)
 * under ~/.pi/agent/clips.
 *
 * Distinct from RecordingService: that produces an executable skill; this
 * produces watchable, agent-readable media. The two share the native capture
 * binary and the recorder tray, but nothing else.
 */
import { existsSync } from "node:fs";
import { shell, type MenuItemConstructorOptions } from "electron";
import type { Emit } from "../ipc/registry.ts";
import type { ClipContext, ClipState, ClipStopResult, ImagePayload } from "@peach-pi/shared-types";
import {
  startCapture,
  stopCapture,
  killCapture,
  captureBinPath,
  type ActiveCapture,
} from "@peach-pi/record-replay/src/capture.ts";
import {
  defaultRoot,
  newRecordingId,
  readEvents,
  loadRecording,
  discardRecording,
} from "@peach-pi/record-replay/src/store.ts";
import type { RecordEvent } from "@peach-pi/record-replay/src/types.ts";
import { writeClip, loadClipContext, clipFramesAsImages, clipDir } from "./clip-artifact.ts";

const ROOT = defaultRoot();

function idle(): ClipState {
  return {
    status: "idle",
    clipId: null,
    startedAt: null,
    frameCount: 0,
    message: null,
    clipDir: null,
  };
}

export class ClipService {
  private emit: Emit;
  private active: ActiveCapture | null = null;
  private state: ClipState = idle();
  private frameCount = 0;
  private activeThreadId: string | null = null;
  private trayRefresh: (() => void) | null = null;
  /** Sends a message (with images) into a chat thread. Injected to stay
   *  decoupled from ThreadService. */
  private sender:
    | ((threadId: string, text: string, images: ImagePayload[]) => void | Promise<void>)
    | null = null;

  constructor(emit: Emit) {
    this.emit = emit;
  }

  setSender(
    fn: (threadId: string, text: string, images: ImagePayload[]) => void | Promise<void>,
  ): void {
    this.sender = fn;
  }

  /** Wire the hook that rebuilds the shared recorder tray when clip state
   *  changes (the tray itself is owned by RecordingService). */
  setTrayRefresh(fn: () => void): void {
    this.trayRefresh = fn;
  }

  /** Clip menu items contributed to the shared recorder tray. */
  trayItems(): MenuItemConstructorOptions[] {
    const s = this.state;
    return [
      {
        label: s.status === "recording" ? "◉ Clip recording…" : "Record clip",
        enabled: s.status === "idle" || s.status === "error",
        click: () => this.start(),
      },
      { label: "Stop clip & save", enabled: s.status === "recording", click: () => void this.stop() },
      { label: "Cancel clip", enabled: s.status === "recording", click: () => this.cancel() },
    ];
  }

  private setState(patch: Partial<ClipState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("event:clipState", this.state);
    this.trayRefresh?.();
  }

  status(): ClipState {
    return this.state;
  }

  start(threadId?: string): ClipState {
    if (this.state.status === "recording") return this.state;
    this.activeThreadId = threadId ?? null;

    const bin = captureBinPath();
    if (!existsSync(bin)) {
      this.setState({
        ...idle(),
        status: "error",
        message: `Capture binary not found at ${bin}. Run \`pnpm --filter @peach-pi/record-replay build:native\`.`,
      });
      return this.state;
    }

    const id = newRecordingId();
    this.frameCount = 0;
    const cap = startCapture(ROOT, id, bin, (evt) => {
      if (evt.type === "note") {
        const note = (evt.payload as { note?: string }).note ?? "";
        if (/PERMISSION_DENIED|TAP_FAILED|SCREENSHOT_FAILED/.test(note)) {
          this.setState({ status: "error", message: note });
        }
        return;
      }
      if (evt.type === "screenshot") {
        this.frameCount++;
        this.setState({ frameCount: this.frameCount, status: "recording" });
      }
    });

    if (cap.proc) {
      cap.proc.on("exit", (code) => {
        if (this.state.status === "recording" && code !== 0 && code !== null) {
          this.setState({
            status: "error",
            message: `Capture process exited (code ${code}). Permissions granted to Peach Pi?`,
          });
        }
      });
    }

    this.active = cap;
    const rec = loadRecording(ROOT, id);
    this.setState({
      status: "recording",
      clipId: id,
      startedAt: rec?.startedAt ?? new Date().toISOString(),
      frameCount: 0,
      message: null,
      clipDir: null,
    });
    return this.state;
  }

  async stop(): Promise<ClipStopResult> {
    const id = this.state.clipId;
    if (!id || !this.active) throw new Error("No active clip to stop");
    killCapture(this.active);
    this.active = null;

    const { rec } = stopCapture(ROOT, id, "stop");
    const events = readEvents(ROOT, id).map((l) => JSON.parse(l) as RecordEvent);
    const durationMs = rec?.durationMs ?? 0;
    const createdAt = rec?.startedAt ?? new Date().toISOString();

    const { context, contextPath, dir } = writeClip(id, events, durationMs, createdAt);
    // The raw capture (events + shots) was only the source; the clip dir is the
    // self-contained artifact. Discard the recording so it doesn't pollute the
    // record-and-replay list.
    discardRecording(ROOT, id);

    const threadId = this.activeThreadId;
    this.activeThreadId = null;
    if (threadId) await this.deliver(id, threadId);

    this.setState({ ...idle(), clipDir: dir });
    return { clipId: id, clipDir: dir, durationMs, frameCount: context.frames.length, contextPath };
  }

  cancel(): ClipState {
    const id = this.state.clipId;
    if (this.active) {
      killCapture(this.active);
      this.active = null;
    }
    if (id) stopCapture(ROOT, id, "cancel");
    this.frameCount = 0;
    this.setState(idle());
    return this.state;
  }

  /** Attach an already-saved clip's frames + metadata into a chat thread. */
  async attachToThread(clipId: string, threadId: string): Promise<void> {
    if (!loadClipContext(clipId)) throw new Error(`Clip not found: ${clipId}`);
    await this.deliver(clipId, threadId);
  }

  private async deliver(clipId: string, threadId: string): Promise<void> {
    const ctx = loadClipContext(clipId);
    if (!ctx || !this.sender) return;
    const images = clipFramesAsImages(ctx, clipId);
    await this.sender(threadId, clipIntroText(ctx, clipId), images);
  }

  reveal(dir: string): void {
    if (existsSync(dir)) void shell.openPath(dir);
  }

  dispose(): void {
    if (this.active) killCapture(this.active);
    this.active = null;
  }
}

/** Human + agent-readable preamble that accompanies the attached frames. */
function clipIntroText(ctx: ClipContext, id: string): string {
  const lines: string[] = [
    `Screen clip: ${ctx.frames.length} timestamped frames over ${Math.round(ctx.durationMs / 1000)}s, attached as images in capture order.`,
  ];
  if (ctx.chapters.length) {
    lines.push("", "Chapters:");
    for (const c of ctx.chapters) lines.push(`- ${fmtMs(c.startMs)} ${c.title}`);
  }
  lines.push(
    "",
    `Frame timestamps (ms from start): ${ctx.frames.map((f) => f.atMs).join(", ")}.`,
    `Full manifest: ${clipDir(id)}/context.json`,
  );
  return lines.join("\n");
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
