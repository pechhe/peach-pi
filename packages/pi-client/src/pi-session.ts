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
import { createBashOverrideDefinition } from "./bash-override.ts";
import { createUiBridge, type UiBridgeCallbacks } from "./extension-ui-bridge.ts";
import { TerminalCustomDriver, type TerminalCustomFrameEvent } from "./terminal-custom.ts";
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
  /** A render frame from an extension's `custom()` TUI overlay. */
  onTerminalCustomFrame?(frame: TerminalCustomFrameEvent): void;
  /** Current auto-compaction thresholds; read after each run ends. */
  getAutoCompact?(): AutoCompactSettings;
  /** Fired on every tool_execution_start with the tool name + full args (before
   *  arg summarisation). Lets the app observe commands an agent runs — e.g. a
   *  `git worktree add` that creates an isolated checkout the app should adopt
   *  so the thread's branch label reflects where work actually lands. */
  onToolStart?(toolName: string, args: unknown): void;
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
  private terminalCustom: TerminalCustomDriver;
  private extensionsResult: LoadExtensionsResult | null = null;
  private allToolNames: string[];
  private toolMode: ToolMode = "all";
  /** Resolvers waiting for an in-flight compaction to end before their
   *  queued prompt is sent. Sending during compaction aborts it; these let
   *  prompt() queue instead. */
  private compactionWaiters: Array<() => void> = [];

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
    this.terminalCustom = new TerminalCustomDriver((frame) =>
      this.callbacks.onTerminalCustomFrame?.(frame),
    );
    this.allToolNames = session.getAllTools().map((t) => t.name);
    this.unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_start") this.callbacks.onRunningChange(true);
      if (event.type === "agent_end" && !event.willRetry) {
        this.callbacks.onRunningChange(false);
        this.callbacks.onMetaChange?.();
      }
      if (event.type === "compaction_end" && !(event.aborted || event.errorMessage)) {
        // Success: a compaction entry is now persisted on the branch. Reload
        // from the branch before the recorder patches the leaf card, so the
        // real summary renders as an in-stream divider (the transient card is
        // wiped by the reset). This is the same rebuild-from-truth used on
        // rewind/resume — it touches the SDK session manager, so it stays here
        // rather than in the SDK-free recorder. (Failure path finalises the
        // transient card in place with no reload.)
        this.callbacks.onOps(
          this.recorder.loadFromEntries(this.session.sessionManager.getBranch()),
        );
      }
      if (event.type === "compaction_end") {
        // Meta (context/model) and the run flag are session lifecycle, not
        // transcript, so they stay here. A standalone compaction (manual /
        // threshold after a finished turn) can leave the app's running flag
        // stuck true with no paired `agent_end`; reconcile it.
        this.callbacks.onMetaChange?.();
        if (!event.willRetry && !this.session.isStreaming) {
          this.callbacks.onRunningChange(false);
        }
        // Release any prompts queued while the compaction was running.
        // Compact's finally clears `_compactionAbortController` after the
        // emit, so each waiter re-checks `isCompacting` and re-arms via a
        // microtask if it's not yet false (retry / emit-before-finally).
        this.wakeCompactionWaiters();
      }
      if (event.type === "auto_retry_end" && !event.success) {
        // A cancelled/exhausted auto-retry ends the run, but the SDK only
        // emits a trailing `agent_end` (which flips running→false) when the
        // retry budget is *exhausted*: the agent_end before the backoff sleep
        // was stamped willRetry:true. If the user aborts (Esc) during that
        // backoff, the SDK aborts the sleep and emits `auto_retry_end`
        // (finalError "Retry cancelled") with NO further agent_end — so
        // onRunningChange(false) never fires and the app is stuck showing
        // "Working…" forever (Esc no-ops thereafter: nothing is streaming
        // left to abort). Reconcile the run flag here, mirroring the
        // compaction_end path. Idempotent on the exhausted path, where a
        // willRetry:false agent_end already cleared it.
        if (!this.session.isStreaming) {
          this.callbacks.onRunningChange(false);
          this.callbacks.onMetaChange?.();
        }
      }
      if (event.type === "thinking_level_changed") this.callbacks.onMetaChange?.();
      if (event.type === "queue_update") {
        this.callbacks.onQueueChange?.([...event.steering], [...event.followUp]);
      }
      if (event.type === "tool_execution_start") {
        this.callbacks.onToolStart?.(event.toolName ?? "", event.args);
      }
      const ops = this.recorder.handleEvent(event as RecorderEvent);
      if (ops.length > 0) this.callbacks.onOps(ops);
    });
  }

  /** New persistent session, resume when `sessionFile` given, or fork a
   *  source session up to `forkFrom.leafId` into a new JSONL file. `forkFrom`
   *  is mutually exclusive with `sessionFile`. A `null`/`undefined` leafId
   *  forks the whole source tree (clone semantics — pi `/clone`); a specific
   *  entry id linearises root→that entry's parent (fork semantics — pi `/fork`). */
  static async create(
    cwd: string,
    callbacks: PiSessionCallbacks,
    options?: {
      sessionFile?: string;
      forkFrom?: { sourceFile: string; leafId?: string | null };
    },
  ): Promise<PiSession> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const authStorage = sdk.AuthStorage.create();
    const modelRegistry = sdk.ModelRegistry.create(authStorage);
    let sessionManager;
    if (options?.forkFrom) {
      // Mirror pi's runtime `fork()` for persisted sessions: re-open the source
      // file into a fresh SessionManager (never mutate the live source), then
      // linearise root→leafId into a new `.jsonl` with a `parentSession` link.
      const fresh = sdk.SessionManager.open(options.forkFrom.sourceFile);
      const leafId = options.forkFrom.leafId ?? fresh.getLeafId();
      if (!leafId) {
        throw new Error("Cannot fork: source session has no entries");
      }
      fresh.createBranchedSession(leafId);
      sessionManager = fresh;
    } else if (options?.sessionFile) {
      sessionManager = sdk.SessionManager.open(options.sessionFile);
    } else {
      sessionManager = sdk.SessionManager.create(cwd);
    }
    const agentDir = sdk.getAgentDir();
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir });
    await loader.reload();
    // Override the built-in `bash` tool with one that applies a default
    // per-command timeout when the agent omits one (see bash-override.ts).
    // Without this, a runaway command like `find /` wedges the agent turn
    // until the user manually aborts it. The SDK's tool registry lets a
    // custom tool shadow a built-in by name, so we only swap `operations`.
    const settings = sdk.SettingsManager.create(cwd, agentDir);
    const bashOverride = createBashOverrideDefinition(
      cwd,
      sdk.createBashToolDefinition,
      sdk.createLocalBashOperations,
      {
        shellPath: settings.getShellPath(),
        commandPrefix: settings.getShellCommandPrefix(),
      },
    );
    const { session, extensionsResult } = await sdk.createAgentSession({
      cwd,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader: loader,
      customTools: [bashOverride],
    });
    const recorder = new TranscriptRecorder();
    // Seed from the full active branch (root→leaf), not the SDK's trimmed
    // `session.messages`: the GUI scrollback shows the whole conversation,
    // with compaction summaries as in-stream dividers, while the LLM context
    // stays trimmed. (`session.messages` is only what's sent to the model.)
    const branch = session.sessionManager.getBranch();
    const loadOps = recorder.loadFromEntries(branch);
    const pi = new PiSession(session, recorder, callbacks, loader);
    pi.extensionsResult = extensionsResult;
    await session.bindExtensions({
      // "tui" (not "rpc") so extensions that gate terminal UI behind
      // ctx.mode === "tui" actually invoke ui.custom(); we render those onto
      // the xterm overlay (createUiBridge.onTerminalCustom). Component-based
      // widgets/footers remain no-ops.
      mode: "tui",
      uiContext: createUiBridge({
        onDialog: (req) =>
          callbacks.onExtensionDialog
            ? callbacks.onExtensionDialog(req)
            : Promise.resolve(undefined),
        onNotify: (message, level) => callbacks.onExtensionNotify?.(message, level),
        onStatus: (key, text) => callbacks.onExtensionStatus?.(key, text),
        onWidget: (key, lines) => callbacks.onExtensionWidget?.(key, lines),
        onTerminalCustom: (factory) => pi.driveTerminalCustom(factory),
      }),
      onError: (err) =>
        callbacks.onExtensionNotify?.(
          `Extension error (${err.extensionPath}): ${err.error}`,
          "error",
        ),
    });
    if (branch.length > 0) callbacks.onOps(loadOps);
    return pi;
  }

  get sessionFile(): string | undefined {
    return this.session.sessionFile;
  }

  /** Parent entry id of a session-tree entry, or null at root. Used by the
   *  fork-before path: pi forks to the parent of the selected user message. */
  getEntryParentId(entryId: string): string | null {
    const entry = this.session.sessionManager.getEntry(entryId);
    return entry?.parentId ?? null;
  }

  get isStreaming(): boolean {
    return this.session.isStreaming;
  }

  transcript(): TranscriptItem[] {
    return this.recorder.transcript();
  }

  /** User turns available as rewind targets (session-tree entry ids, in branch order). */
  listTurns(): { entryId: string; text: string }[] {
    return this.session.getUserMessagesForForking();
  }

  /**
   * Rewind the conversation to before the given user-message entry: moves the
   * session-tree leaf there (pi keeps the abandoned branch — history is never
   * destroyed) and rebuilds the transcript from the now-active branch. Returns
   * the rewound turn's prompt so the caller can refill the composer.
   * Does NOT revert file changes on disk (conversation-only).
   */
  async rewind(entryId: string): Promise<{ editorText?: string }> {
    if (this.session.isStreaming) throw new Error("Cannot rewind while a run is in progress");
    const result = await this.session.navigateTree(entryId);
    if (result.cancelled) return {};
    this.callbacks.onOps(this.recorder.loadFromEntries(this.session.sessionManager.getBranch()));
    this.callbacks.onMetaChange?.();
    return { editorText: result.editorText };
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
   * Reload this session's settings from disk (settings.json) + republish meta.
   * Called after the global `enabledModels` scope changes outside this session
   * (Settings UI) so the composer's scoped list reflects the new scope.
   */
  async reloadSettings(): Promise<void> {
    await this.session.settingsManager.reload();
    this.callbacks.onMetaChange?.();
  }

  /** Hot-reload extensions/skills/prompts/themes from disk via the SDK's
   *  `AgentSession.reload()`. Re-imports extension module files, rebuilds the
   *  tool registry, and re-emits `session_start` to the new extension runner —
 *  without losing the current conversation. Must not be called while a run
   *  is in progress (the SDK invalidates captured ctxs on reload). Inserts an
   *  inline notice into the transcript so the user can see it happened. */
  async reload(): Promise<void> {
    await this.session.reload();
    this.callbacks.onOps([
      {
        op: "upsert",
        item: {
          id: `reload-${Date.now()}`,
          kind: "notice",
          text: "Session reloaded — extensions, skills, and prompts refreshed from disk.",
        },
      },
    ]);
    this.callbacks.onMetaChange?.();
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
    // If a compaction is in flight, wait for it to finish before sending.
    // Barging ahead aborts the compaction (the SDK's prompt path conflicts
    // with the in-flight compact() run). Queue the prompt instead and let
    // compaction complete cleanly — the optimistic echo + send run once the
    // leaf is rebuilt from the compacted branch.
    while (this.session.isCompacting) await this.waitForCompaction();
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
    // Optimistic echo: see threadService.prompt for the full rationale. The
    // SDK runs `before_agent_start` (which pi-vision-proxy uses for a blocking
    // vision-model round-trip) *before* it emits the user `message_start`, so
    // the sent message + image otherwise wouldn't render until that returns.
    // The recorder seeds placeholders only for image-bearing prompts and
    // drops them when the real user message_start arrives. Routed through
    // onOps so main flushes like any op.
    const pending = this.recorder.seedPendingUser(text, images);
    if (pending.length > 0) this.callbacks.onOps(pending);
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

  /** Delete a queued follow-up message by index. */
  async deleteFollowUp(index: number): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    for (const s of steering) await this.session.steer(s);
    for (let i = 0; i < followUp.length; i++) {
      if (i !== index) await this.session.followUp(followUp[i]!);
    }
  }

  /** Delete a queued steer message by index. */
  async deleteSteer(index: number): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    for (let i = 0; i < steering.length; i++) {
      if (i !== index) await this.session.steer(steering[i]!);
    }
    for (const f of followUp) await this.session.followUp(f);
  }

  /** Resolve one queued prompt waiter once the in-flight compaction ends.
   *  Re-arms via a microtask until `isCompacting` is actually false, so it is
   *  robust whether the SDK's `compaction_end` fires before or after its
   *  finally-block clears the abort controller. */
  private waitForCompaction(): Promise<void> {
    if (!this.session.isCompacting) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.session.isCompacting) resolve();
        else queueMicrotask(check);
      };
      this.compactionWaiters.push(check);
    });
  }

  private wakeCompactionWaiters(): void {
    if (this.compactionWaiters.length === 0) return;
    const waiters = this.compactionWaiters;
    this.compactionWaiters = [];
    for (const check of waiters) queueMicrotask(check);
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

  /** Retry a failed compaction. Alias for compact(); the guard in compact()
   *  prevents double-starts while one is already running. */
  retryCompact(): void {
    this.compact();
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  /** Drive an extension `custom()` TUI; resolves with its done() result. */
  driveTerminalCustom(factory: unknown): Promise<unknown> {
    return this.terminalCustom.drive(factory as Parameters<TerminalCustomDriver["drive"]>[0]);
  }

  /** Forward a keystroke to a live `custom()` TUI component. */
  terminalCustomInput(requestId: string, data: string): void {
    this.terminalCustom.input(requestId, data);
  }

  /** Cancel a live `custom()` TUI component. */
  cancelTerminalCustom(requestId: string): void {
    this.terminalCustom.cancel(requestId);
  }

  /** Clear the `custom()` overlay when the owning command ends. */
  closeTerminalCustom(): void {
    this.terminalCustom.close();
  }

  dispose(): void {
    this.terminalCustom.close();
    this.unsubscribe();
    this.session.dispose();
  }
}
