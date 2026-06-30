/**
 * Clip recorder UI state. Mirrors the main-process ClipService via the
 * `event:clipState` subscription; `start/stop/cancel` cross the typed IPC seam.
 * A derived elapsed timer ticks while status === "recording".
 */
import { api } from "../lib/ipc";
import type { ClipState, ClipStopResult } from "@peach-pi/shared-types";

class ClipStore {
  state = $state<ClipState>({
    status: "idle",
    clipId: null,
    startedAt: null,
    frameCount: 0,
    message: null,
    clipDir: null,
  });
  /** Seconds since startedAt; updated by a 1s interval while recording. */
  elapsed = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void api.invoke("clip:status").then((s) => this.set(s));
    api.on("event:clipState", (s) => this.set(s));
  }

  private set(s: ClipState): void {
    this.state = s;
    if (s.status === "recording" && s.startedAt) {
      this.startTimer(s.startedAt);
    } else {
      this.stopTimer();
      this.elapsed = 0;
    }
  }

  private startTimer(startedAt: string): void {
    this.elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.elapsed++;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  start(threadId?: string): void {
    void api.invoke("clip:start", threadId);
  }

  async stop(): Promise<ClipStopResult> {
    return api.invoke("clip:stop");
  }

  cancel(): void {
    void api.invoke("clip:cancel");
  }

  reveal(dir: string): void {
    void api.invoke("clip:reveal", dir);
  }

  get isActive(): boolean {
    return this.state.status === "recording";
  }
}

export const clip = new ClipStore();
