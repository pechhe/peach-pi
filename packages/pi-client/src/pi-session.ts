import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type {
  CommandInfo,
  ImagePayload,
  ModelInfo,
  ThinkingLevel,
  ToolMode,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";
import { TranscriptRecorder, type RecorderEvent } from "./transcript-recorder.ts";

export interface PiSessionCallbacks {
  onOps(ops: TranscriptOp[]): void;
  onRunningChange(running: boolean): void;
  onQueueChange?(steering: string[], followUp: string[]): void;
  /** Model/thinking/context-usage changed; payload = PiSession.meta(). */
  onMetaChange?(): void;
}

export interface PiSessionMeta {
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  contextTokens: number | null;
  contextWindow: number | null;
  contextPercent: number | null;
}

/** Tools allowed while plan mode runs. Mutating tools stay disabled. */
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

/**
 * One live pi session bound to a thread. Owns the SDK session, the
 * transcript recorder, and event fan-out. Disposable.
 */
export class PiSession {
  private session: AgentSession;
  private recorder: TranscriptRecorder;
  private callbacks: PiSessionCallbacks;
  private unsubscribe: () => void;
  private loader: DefaultResourceLoader;
  private allToolNames: string[];
  private toolMode: ToolMode = "all";

  private constructor(
    session: AgentSession,
    recorder: TranscriptRecorder,
    callbacks: PiSessionCallbacks,
    loader: DefaultResourceLoader,
  ) {
    this.session = session;
    this.recorder = recorder;
    this.callbacks = callbacks;
    this.loader = loader;
    this.allToolNames = session.getAllTools().map((t) => t.name);
    this.unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_start") this.callbacks.onRunningChange(true);
      if (event.type === "agent_end" && !event.willRetry) {
        this.callbacks.onRunningChange(false);
        this.callbacks.onMetaChange?.();
      }
      if (event.type === "thinking_level_changed") this.callbacks.onMetaChange?.();
      if (event.type === "queue_update") {
        this.callbacks.onQueueChange?.([...event.steering], [...event.followUp]);
      }
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
    const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader: loader,
    });
    const recorder = new TranscriptRecorder();
    const loadOps = recorder.load(session.messages);
    const pi = new PiSession(session, recorder, callbacks, loader);
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

  meta(): PiSessionMeta {
    const model = this.session.model;
    const usage = this.session.getContextUsage();
    return {
      model: model ? { provider: model.provider, id: model.id, name: model.name } : null,
      thinkingLevel: this.session.thinkingLevel,
      availableThinkingLevels: this.session.getAvailableThinkingLevels(),
      contextTokens: usage?.tokens ?? null,
      contextWindow: usage?.contextWindow ?? null,
      contextPercent: usage?.percent ?? null,
    };
  }

  listModels(): ModelInfo[] {
    return this.session.modelRegistry
      .getAvailable()
      .map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    const model = this.session.modelRegistry.find(provider, modelId);
    if (!model) throw new Error(`Unknown model: ${provider}/${modelId}`);
    await this.session.setModel(model);
    this.callbacks.onMetaChange?.();
  }

  setThinking(level: ThinkingLevel): void {
    this.session.setThinkingLevel(level);
    this.callbacks.onMetaChange?.();
  }

  /** Slash-menu entries: file-based prompt templates discovered for this cwd. */
  commands(): CommandInfo[] {
    return this.loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description ?? "",
    }));
  }

  async prompt(text: string, images?: ImagePayload[], toolMode?: ToolMode): Promise<void> {
    if (toolMode && toolMode !== this.toolMode) {
      this.toolMode = toolMode;
      this.session.setActiveToolsByName(
        toolMode === "readOnly"
          ? this.allToolNames.filter((n) => READ_ONLY_TOOLS.includes(n))
          : this.allToolNames,
      );
    }
    const imageContent = images?.map((img) => ({
      type: "image" as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    const options = imageContent?.length ? { images: imageContent } : {};
    if (this.session.isStreaming) {
      await this.session.prompt(text, { ...options, streamingBehavior: "steer" });
    } else {
      await this.session.prompt(text, options);
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
