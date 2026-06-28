/**
 * Recorder UI state. Mirrors the main-process RecordingService via the
 * `event:recordingState` subscription; `start/stop/cancel` cross the typed IPC
 * seam. A derived elapsed timer ticks while status === "recording".
 */
import { api } from "../lib/ipc";
import type { RecordingState } from "@peach-pi/shared-types";

class RecordingStore {
  state = $state<RecordingState>({
    status: "idle",
    recordingId: null,
    startedAt: null,
    eventCount: 0,
    message: null,
    skillPath: null,
  });
  /** Seconds since startedAt; updated by a 1s interval while recording. */
  elapsed = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Seed initial state, then subscribe to live updates.
    void api.invoke("recording:status").then((s) => this.set(s));
    api.on("event:recordingState", (s) => this.set(s));
  }

  private set(s: RecordingState): void {
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
    void api.invoke("recording:start", threadId);
  }

  async stop(): Promise<{ skillPath: string | null; digest: string }> {
    // Main process owns the thread↔recording association and auto-sends the
    // synthesis prompt to the originating chat on stop.
    const r = await api.invoke("recording:stop");
    return { skillPath: r.skillPath, digest: r.digest };
  }

  cancel(): void {
    void api.invoke("recording:cancel");
  }

  revealSkill(path: string): void {
    void api.invoke("recording:revealSkill", path);
  }

  get isActive(): boolean {
    return this.state.status === "recording";
  }
}

export const recording = new RecordingStore();
