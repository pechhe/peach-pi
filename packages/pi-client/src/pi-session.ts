// Type-only imports stay static; runtime values load via dynamic import so the
// CJS Electron main bundle can consume the ESM-only pi SDK (require(esm) fails
// on its import-only exports map).
import type {
  AgentSession,
  DefaultResourceLoader,
  LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";
import type {
  AutoCompactSettings,
  CommandInfo,
  ImagePayload,
  ModelInfo,
  ThinkingLevel,
  ToolMode,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";
import { TranscriptRecorder, type RecorderEvent } from "./transcript-recorder.ts";
import { createUiBridge, type UiBridgeCallbacks } from "./extension-ui-bridge.ts";
import { scopeModels, stripThinkingSuffix } from "./scope-models.ts";

export interface PiSessionCallbacks {
  onOps(ops: TranscriptOp[]): void;
  onRunningChange(running: boolean): void;
  onQueueChange?(steering: string[], followUp: string[]): void;
  /** Model/thinking/context-usage changed; payload = PiSession.meta(). */
  onMetaChange?(): void;
  /** Extension dialog (select/confirm/input). Resolve with user's answer. */
  onExtensionDialog?: UiBridgeCallbacks["onDialog"];
  onExtensionNotify?(message: string, level: "info" | "warning" | "error"): void;
  onExtensionStatus?(key: string, text: string | null): void;
  onExtensionWidget?(key: string, lines: string[] | null): void;
  /** Current auto-compaction thresholds; read after each run ends. */
  getAutoCompact?(): AutoCompactSettings;
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

/** Fallback thresholds when no config provider is supplied. */
const DEFAULT_AUTO_COMPACT: AutoCompactSettings = { percent: 80, tokens: null };

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
  private extensionsResult: LoadExtensionsResult | null = null;
  private allToolNames: string[];
  private toolMode: ToolMode = "all";
  /** FIFO queue of in-flight compaction card ids. Multiple compactions can
   *  overlap (app auto-compact, extension smart-compact, SDK builtin). Using
   *  a queue ensures every start→end pair closes the correct card — a single
   *  id was getting orphaned on overlap, leaving a permanent spinner. */
  private activeCompactionIds: string[] = [];

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
        this.maybeAutoCompact();
      }
      if (event.type === "compaction_start") {
        // Finalise any orphaned still-running card from a prior overlapping
        // compaction so it doesn't spin forever.
        while (this.activeCompactionIds.length > 0) {
          const orphan = this.activeCompactionIds.shift()!;
          this.callbacks.onOps([
            {
              op: "upsert",
              item: {
                id: orphan,
                kind: "compaction",
                running: false,
                reason: event.reason,
                aborted: true,
                error: "Superseded by a newer compaction",
              },
            },
          ]);
        }
        const id = `compaction-${Date.now()}`;
        this.activeCompactionIds.push(id);
        this.callbacks.onOps([
          {
            op: "upsert",
            item: {
              id,
              kind: "compaction",
              running: true,
              reason: event.reason,
            },
          },
        ]);
      }
      if (event.type === "compaction_end") {
        // Pop the matching start id. If the queue is empty (unexpected end
        // without a paired start), fabricate a card that still renders as
        // completed rather than spinning forever.
        const id = this.activeCompactionIds.shift() ?? `compaction-${Date.now()}`;
        this.callbacks.onOps([
          {
            op: "upsert",
            item: {
              id,
              kind: "compaction",
              running: false,
              reason: event.reason,
              summary: event.result?.summary,
              tokensBefore: event.result?.tokensBefore,
              aborted: event.aborted,
              error: event.errorMessage,
            },
          },
        ]);
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
    const sdk = await import("@earendil-works/pi-coding-agent");
    const authStorage = sdk.AuthStorage.create();
    const modelRegistry = sdk.ModelRegistry.create(authStorage);
    const sessionManager = sessionFile
      ? sdk.SessionManager.open(sessionFile)
      : sdk.SessionManager.create(cwd);
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir: sdk.getAgentDir() });
    await loader.reload();
    const { session, extensionsResult } = await sdk.createAgentSession({
      cwd,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader: loader,
    });
    const recorder = new TranscriptRecorder();
    const loadOps = recorder.load(session.messages);
    const pi = new PiSession(session, recorder, callbacks, loader);
    pi.extensionsResult = extensionsResult;
    await session.bindExtensions({
      mode: "rpc",
      uiContext: createUiBridge({
        onDialog: (req) =>
          callbacks.onExtensionDialog
            ? callbacks.onExtensionDialog(req)
            : Promise.resolve(undefined),
        onNotify: (message, level) => callbacks.onExtensionNotify?.(message, level),
        onStatus: (key, text) => callbacks.onExtensionStatus?.(key, text),
        onWidget: (key, lines) => callbacks.onExtensionWidget?.(key, lines),
      }),
      onError: (err) =>
        callbacks.onExtensionNotify?.(
          `Extension error (${err.extensionPath}): ${err.error}`,
          "error",
        ),
    });
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
    const available = this.session.modelRegistry.getAvailable();
    const enabled = this.session.settingsManager.getEnabledModels();
    const scoped = enabled && enabled.length > 0 ? scopeModels(available, enabled) : available;
    return scoped.map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
  }

  /** All auth-configured models, unscoped (for the selector's "all models" view). */
  listAllModels(): ModelInfo[] {
    return this.session.modelRegistry
      .getAvailable()
      .map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
  }

  /**
   * Toggle a model's membership in the global `enabledModels` scope
   * (settings.json, shared with the pi TUI). Persists immediately.
   */
  async setModelScoped(provider: string, modelId: string, scoped: boolean): Promise<void> {
    const sm = this.session.settingsManager;
    const key = `${provider}/${modelId}`;
    const current = sm.getEnabledModels();
    let next: string[];
    if (current && current.length > 0) {
      if (scoped) {
        next = current.includes(key) ? current : [...current, key];
      } else {
        next = current.filter((p) => stripThinkingSuffix(p) !== key);
      }
    } else {
      // Empty scope means every model is implicitly scoped.
      if (scoped) return;
      next = this.listAllModels()
        .map((m) => `${m.provider}/${m.id}`)
        .filter((k) => k !== key);
    }
    sm.setEnabledModels(next);
    await sm.flush();
    this.callbacks.onMetaChange?.();
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

  /** Slash-menu entries: prompt templates, extension commands, and skills. */
  commands(): CommandInfo[] {
    const prompts = this.loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      kind: "prompt" as const,
    }));
    const extension = (this.extensionsResult?.extensions ?? []).flatMap((e) =>
      [...e.commands.values()].map((c) => ({
        name: c.name,
        description: c.description ?? "",
        kind: "extension" as const,
      })),
    );
    // Skills surface under their friendly name; resolveSlashShorthand() rewrites
    // `/name` to the `/skill:name` form the SDK expands at submit time.
    const skills = this.loader.getSkills().skills.map((s) => ({
      name: s.name,
      description: s.description,
      kind: "skill" as const,
    }));
    const seen = new Set<string>();
    return [...prompts, ...extension, ...skills].filter((c) =>
      seen.has(c.name) ? false : (seen.add(c.name), true),
    );
  }

  /**
   * Rewrite a leading `/<name>` to `/skill:<name>` when `<name>` is a skill not
   * already shadowed by a prompt template or extension command (which the SDK
   * resolves itself). Lets users type `/diagnose` instead of `/skill:diagnose`.
   */
  private resolveSlashShorthand(text: string): string {
    const match = /^\/(\S+)/.exec(text);
    if (!match) return text;
    const token = match[1]!;
    if (token.includes(":")) return text; // already namespaced, e.g. /skill:foo
    const isSkill = this.loader.getSkills().skills.some((s) => s.name === token);
    if (!isSkill) return text;
    const isPrompt = this.loader.getPrompts().prompts.some((p) => p.name === token);
    const isExtCmd = (this.extensionsResult?.extensions ?? []).some((e) => e.commands.has(token));
    if (isPrompt || isExtCmd) return text; // SDK resolves these directly
    return text.replace(/^\/\S+/, `/skill:${token}`);
  }

  async prompt(text: string, images?: ImagePayload[], toolMode?: ToolMode): Promise<void> {
    text = this.resolveSlashShorthand(text);
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
      await this.session.prompt(text, { ...options, streamingBehavior: "followUp" });
    } else {
      await this.session.prompt(text, options);
    }
  }

  async steer(text: string): Promise<void> {
    await this.session.steer(this.resolveSlashShorthand(text));
  }

  /** Promote a queued follow-up to a steer by index. Returns promoted text or null. */
  async promoteFollowUpToSteer(index: number): Promise<string | null> {
    const { steering, followUp } = this.session.clearQueue();
    if (index < 0 || index >= followUp.length) {
      // Restore everything — index out of bounds.
      for (const s of steering) await this.session.steer(s);
      for (const f of followUp) await this.session.followUp(f);
      return null;
    }
    const target = followUp[index]!;
    // Re-add existing steering messages.
    for (const s of steering) await this.session.steer(s);
    // Promote target to steer.
    await this.session.steer(target);
    // Re-add remaining follow-ups.
    for (let i = 0; i < followUp.length; i++) {
      if (i !== index) await this.session.followUp(followUp[i]!);
    }
    return target;
  }

  /** Pop the last queued follow-up message and return its text (for recall to composer). */
  async popLastFollowUp(): Promise<string | null> {
    const { steering, followUp } = this.session.clearQueue();
    if (followUp.length === 0) {
      for (const s of steering) await this.session.steer(s);
      return null;
    }
    const last = followUp.pop()!;
    // Restore everything except the popped item.
    for (const s of steering) await this.session.steer(s);
    for (const f of followUp) await this.session.followUp(f);
    return last;
  }

  /** Manual compaction. Progress/result surface as notice transcript items. */
  compact(): void {
    if (this.session.isCompacting || this.session.isStreaming) return;
    void this.session.compact().catch((error: unknown) =>
      this.callbacks.onOps([
        {
          op: "upsert",
          item: {
            id: `compaction-err-${Date.now()}`,
            kind: "notice",
            text: `Compaction failed: ${String(error)}`,
          },
        },
      ]),
    );
  }

  /** Compact when usage crosses either threshold — whichever is reached first. */
  private maybeAutoCompact(): void {
    const usage = this.session.getContextUsage();
    if (!usage) return;
    const { percent, tokens } = this.callbacks.getAutoCompact?.() ?? DEFAULT_AUTO_COMPACT;
    const hitPercent = usage.percent != null && usage.percent >= percent;
    const hitTokens = tokens != null && usage.tokens != null && usage.tokens >= tokens;
    if (hitPercent || hitTokens) this.compact();
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  dispose(): void {
    this.unsubscribe();
    this.session.dispose();
  }
}
