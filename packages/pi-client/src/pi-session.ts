import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { TranscriptItem, TranscriptOp } from "@peach-pi/shared-types";
import { TranscriptRecorder, type RecorderEvent } from "./transcript-recorder.ts";

export interface PiSessionCallbacks {
  onOps(ops: TranscriptOp[]): void;
  onRunningChange(running: boolean): void;
}

/**
 * One live pi session bound to a thread. Owns the SDK session, the
 * transcript recorder, and event fan-out. Disposable.
 */
export class PiSession {
  private session: AgentSession;
  private recorder: TranscriptRecorder;
  private callbacks: PiSessionCallbacks;
  private unsubscribe: () => void;

  private constructor(
    session: AgentSession,
    recorder: TranscriptRecorder,
    callbacks: PiSessionCallbacks,
  ) {
    this.session = session;
    this.recorder = recorder;
    this.callbacks = callbacks;
    this.unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_start") this.callbacks.onRunningChange(true);
      if (event.type === "agent_end" && !event.willRetry) this.callbacks.onRunningChange(false);
      const ops = this.recorder.handleEvent(event as RecorderEvent);
      if (ops.length > 0) this.callbacks.onOps(ops);
    });
  }

  /** New persistent session, or resume when sessionFile given. */
  static async create(
    cwd: string,
    callbacks: PiSessionCallbacks,
    sessionFile?: string,
  ): Promise<PiSession> {
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile)
      : SessionManager.create(cwd);
    const { session } = await createAgentSession({
      cwd,
      sessionManager,
      authStorage,
      modelRegistry,
    });
    const recorder = new TranscriptRecorder();
    const loadOps = recorder.load(session.messages);
    const pi = new PiSession(session, recorder, callbacks);
    if (session.messages.length > 0) callbacks.onOps(loadOps);
    return pi;
  }

  get sessionFile(): string | undefined {
    return this.session.sessionFile;
  }

  get isStreaming(): boolean {
    return this.session.isStreaming;
  }

  transcript(): TranscriptItem[] {
    return this.recorder.transcript();
  }

  async prompt(text: string): Promise<void> {
    if (this.session.isStreaming) {
      await this.session.prompt(text, { streamingBehavior: "steer" });
    } else {
      await this.session.prompt(text);
    }
  }

  async steer(text: string): Promise<void> {
    await this.session.steer(text);
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  dispose(): void {
    this.unsubscribe();
    this.session.dispose();
  }
}
