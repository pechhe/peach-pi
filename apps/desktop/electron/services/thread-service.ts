import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { randomUUID as uuid } from "node:crypto";
import type {
  AutoCompactSettings,
  CommandInfo,
  ImagePayload,
  ModelInfo,
  ResourceInspection,
  SessionMeta,
  ThinkingLevel,
  Thread,
  ThreadSearchHit,
  ToolMode,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";
import type { PiSession } from "@peach-pi/pi-client";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

const FLUSH_MS = 16;

/** Final prompt sent when a thread is parked for testing. The assistant's
 *  one-row markdown table reply is captured as the thread's test note and
 *  rendered as Feature / How-to-test columns in the Testing view. */
const PARK_FOR_TESTING_PROMPT =
  "Reply with ONLY a markdown table, no preamble. Columns: | Feature | Test |. " +
  "One row. Feature: what we built, one short sentence. Test: quickest way to " +
  "check it, one short sentence.";

/** Last assistant message text in a transcript, or undefined if none. */
function lastAssistantText(items: TranscriptItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "assistant" && item.text.trim()) return item.text.trim();
  }
  return undefined;
}

/**
 * Owns live pi sessions keyed by thread id. Streams transcript ops to the
 * renderer with a short coalescing buffer (ported concept from peche-pi's
 * debounced delta publishing).
 */
export class ThreadService {
  private threads: ThreadRepo;
  private projects: ProjectRepo;
  private emit: Emit;
  private onThreadsChanged: () => void;
  private chatsDir: string;
  private onRunIdle?: (thread: Thread) => void;
  private sessions = new Map<string, PiSession>();
  private pendingOps = new Map<string, TranscriptOp[]>();
  /** Threads with an in-flight compaction; their extension toasts are suppressed. */
  private compacting = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  /** Pending extension dialog resolvers keyed by requestId. */
  private pendingDialogs = new Map<string, (value: string | boolean | undefined) => void>();
  /** Reads the persisted utility-model selection (titles/commits); null = defaults. */
  private getUtilityModel: () => ModelInfo | null;
  /** Reads the persisted auto-compaction thresholds. */
  private getAutoCompact: () => AutoCompactSettings;

  constructor(
    db: AppDb,
    emit: Emit,
    onThreadsChanged: () => void,
    chatsDir: string,
    onRunIdle?: (thread: Thread) => void,
    getUtilityModel?: () => ModelInfo | null,
    getAutoCompact?: () => AutoCompactSettings,
  ) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.emit = emit;
    this.onThreadsChanged = onThreadsChanged;
    this.chatsDir = chatsDir;
    this.onRunIdle = onRunIdle;
    this.getUtilityModel = getUtilityModel ?? (() => null);
    this.getAutoCompact = getAutoCompact ?? (() => ({ percent: 80, tokens: null }));
  }

  async createThread(projectId: string, worktreeDir?: string): Promise<Thread> {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const thread = this.threads.insert({ projectId, title: "New thread", worktreeDir });
    await this.ensureSession(thread.id, worktreeDir ?? project.path, null);
    this.onThreadsChanged();
    return this.threads.get(thread.id)!;
  }

  /** Chat = thread without a repo, rooted in its own workspace dir. */
  async createChat(): Promise<Thread> {
    const dir = path.join(this.chatsDir, randomUUID());
    mkdirSync(dir, { recursive: true });
    const thread = this.threads.insert({
      projectId: null,
      title: "New chat",
      chatWorkspaceDir: dir,
    });
    await this.ensureSession(thread.id, dir, null);
    this.onThreadsChanged();
    return this.threads.get(thread.id)!;
  }

  async prompt(
    threadId: string,
    text: string,
    images?: ImagePayload[],
    toolMode?: ToolMode,
  ): Promise<void> {
    const session = await this.sessionFor(threadId);
    const thread = this.threads.get(threadId)!;
    // Sending a message to a thread that's archived / snoozed / marked to test
    // brings it back to the top-level active list.
    if (thread.archivedAt || thread.snoozedUntil || thread.toTestAt) {
      if (thread.archivedAt) this.threads.setArchived(threadId, null);
      if (thread.snoozedUntil) this.threads.setSnoozedUntil(threadId, null);
      if (thread.toTestAt) this.threads.setToTest(threadId, null, null);
      this.onThreadsChanged();
    }
    if (thread.title === "New thread" || thread.title === "New chat") {
      // Instant truncated placeholder so the UI feels snappy, then an async
      // LLM title overwrites it (only if still a placeholder).
      this.threads.setTitle(threadId, text.length > 60 ? `${text.slice(0, 60)}…` : text);
      this.onThreadsChanged();
      void this.generateTitleAndTag(threadId, text);
    }
    // Fire and forget: resolution = run complete; status flows via events.
    void session.prompt(text, images, toolMode).catch((err) => {
      this.queueOps(threadId, [
        {
          op: "upsert",
          item: { id: `err-${Date.now()}`, kind: "notice", text: `Run failed: ${String(err)}` },
        },
      ]);
      this.setStatus(threadId, "failed");
    });
  }

  /** Park a thread for testing: flag it now (shows as pending in the Testing
   *  view), then send one final prompt asking for a terse runthrough. The
   *  captured assistant reply becomes the thread's test note. */
  async markToTest(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) return;
    // Flag immediately so the thread moves to the Testing view in a pending
    // state while the runthrough generates.
    const at = new Date().toISOString();
    this.threads.setToTest(threadId, at, null);
    this.onThreadsChanged();
    // Send the prompt straight to the session (not this.prompt, which would
    // clear the to-test flag), then capture the reply once the run settles.
    const session = await this.sessionFor(threadId);
    try {
      await session.prompt(PARK_FOR_TESTING_PROMPT);
    } catch {
      // Delivery/run failure surfaces via run events; leave the note pending.
      return;
    }
    // Skip capture if the user unmarked or re-prompted while we waited.
    const current = this.threads.get(threadId);
    if (!current?.toTestAt) return;
    const note = lastAssistantText(session.transcript());
    if (note) {
      this.threads.setToTest(threadId, current.toTestAt, note);
      this.onThreadsChanged();
    }
  }

  /** Async LLM title + tag (one call); overwrites the placeholder only if
   *  untouched since. Tag is always applied (set once at thread creation). */
  private async generateTitleAndTag(threadId: string, firstPrompt: string): Promise<void> {
    const placeholder = this.threads.get(threadId)?.title;
    if (!placeholder) return;
    const config = this.getUtilityModel();
    const { generateTitleAndTag } = await import("@peach-pi/pi-client");
    const result = await generateTitleAndTag(firstPrompt, config);
    if (!result) return;
    this.threads.setTag(threadId, result.tag);
    // Only overwrite the title if the user hasn't manually renamed meanwhile.
    if (this.threads.get(threadId)?.title === placeholder) {
      this.threads.setTitle(threadId, result.title);
    }
    this.onThreadsChanged();
  }

  async steer(threadId: string, text: string): Promise<void> {
    await (await this.sessionFor(threadId)).steer(text);
  }

  async promoteFollowUpToSteer(threadId: string, index: number): Promise<string | null> {
    return (await this.sessionFor(threadId)).promoteFollowUpToSteer(index);
  }

  async popLastFollowUp(threadId: string): Promise<string | null> {
    return (await this.sessionFor(threadId)).popLastFollowUp();
  }

  /** Run an extension/slash command in the live session (executes immediately). */
  async runCommand(threadId: string, command: string): Promise<void> {
    const session = await this.sessionFor(threadId);
    void session.prompt(command).catch((err) => {
      this.queueOps(threadId, [
        {
          op: "upsert",
          item: { id: `err-${Date.now()}`, kind: "notice", text: `Command failed: ${String(err)}` },
        },
      ]);
    });
  }

  async abort(threadId: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session) await session.abort();
  }

  async getTranscript(threadId: string): Promise<TranscriptItem[]> {
    return (await this.sessionFor(threadId)).transcript();
  }

  /** Full-text search across thread bodies (pi JSONL session files).
   *  Matches titles too; body matches carry a snippet. Caps at 20 hits and
   *  skips threads whose session file is missing or unreadable. */
  async searchThreads(query: string): Promise<ThreadSearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const { extractSessionText } = await import("@peach-pi/pi-client");
    const projects = this.projects.all();
    const projectName = (id: string | null) =>
      id === null ? "" : (projects.find((p) => p.id === id)?.name ?? "");
    const hits: ThreadSearchHit[] = [];
    for (const t of this.threads.all()) {
      if (t.archivedAt) continue;
      if (hits.length >= 20) break;
      const titleHit = t.title.toLowerCase().includes(q);
      let bodyHit = false;
      let snippet: string | undefined;
      if (t.piSessionFile) {
        let text = "";
        try {
          text = await extractSessionText(t.piSessionFile);
        } catch {
          text = "";
        }
        const lower = text.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx !== -1) {
          bodyHit = true;
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + q.length + 80);
          snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
          if (start > 0) snippet = `…${snippet}`;
          if (end < text.length) snippet = `${snippet}…`;
        }
      }
      if (titleHit || bodyHit) {
        hits.push({ threadId: t.id, title: t.title, projectName: projectName(t.projectId), snippet });
      }
    }
    return hits;
  }

  async listCommands(threadId: string): Promise<CommandInfo[]> {
    return (await this.sessionFor(threadId)).commands();
  }

  async listModels(threadId: string): Promise<ModelInfo[]> {
    return (await this.sessionFor(threadId)).listModels();
  }

  async listAllModels(threadId: string): Promise<ModelInfo[]> {
    return (await this.sessionFor(threadId)).listAllModels();
  }

  async setModelScoped(
    threadId: string,
    provider: string,
    modelId: string,
    scoped: boolean,
  ): Promise<ModelInfo[]> {
    const session = await this.sessionFor(threadId);
    await session.setModelScoped(provider, modelId, scoped);
    return session.listModels();
  }

  async setModel(threadId: string, provider: string, modelId: string): Promise<SessionMeta> {
    const session = await this.sessionFor(threadId);
    await session.setModel(provider, modelId);
    return this.metaFor(threadId, session);
  }

  async setThinking(threadId: string, level: ThinkingLevel): Promise<SessionMeta> {
    const session = await this.sessionFor(threadId);
    session.setThinking(level);
    return this.metaFor(threadId, session);
  }

  async getMeta(threadId: string): Promise<SessionMeta> {
    return this.metaFor(threadId, await this.sessionFor(threadId));
  }

  private metaFor(threadId: string, session: PiSession): SessionMeta {
    return { threadId, ...session.meta() };
  }

  async compact(threadId: string): Promise<void> {
    (await this.sessionFor(threadId)).compact();
  }

  respondExtensionUi(requestId: string, value: string | boolean | undefined): void {
    const resolve = this.pendingDialogs.get(requestId);
    if (resolve) {
      this.pendingDialogs.delete(requestId);
      resolve(value);
    }
  }

  async inspectResources(projectId: string | null): Promise<ResourceInspection> {
    const project = projectId ? this.projects.all().find((p) => p.id === projectId) : null;
    const cwd = project?.path ?? this.chatsDir;
    const { inspectResources } = await import("@peach-pi/pi-client");
    return inspectResources(cwd);
  }

  setTitle(threadId: string, title: string): void {
    this.threads.setTitle(threadId, title);
    this.onThreadsChanged();
  }

  archive(threadId: string): void {
    this.disposeSession(threadId);
    this.threads.setArchived(threadId, new Date().toISOString());
    this.onThreadsChanged();
  }

  unarchive(threadId: string): void {
    this.threads.setArchived(threadId, null);
    this.onThreadsChanged();
  }

  delete(threadId: string): void {
    this.disposeSession(threadId);
    this.threads.delete(threadId);
    this.onThreadsChanged();
  }

  private disposeSession(threadId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.dispose();
      this.sessions.delete(threadId);
    }
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
  }

  /** Get live session, resuming from the persisted pi session file if needed. */
  private async sessionFor(threadId: string): Promise<PiSession> {
    const existing = this.sessions.get(threadId);
    if (existing) return existing;
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    const project = thread.projectId
      ? this.projects.all().find((p) => p.id === thread.projectId)
      : null;
    const cwd = project?.path ?? thread.chatWorkspaceDir ?? process.cwd();
    return this.ensureSession(threadId, cwd, thread.piSessionFile);
  }

  private async ensureSession(
    threadId: string,
    cwd: string,
    sessionFile: string | null,
  ): Promise<PiSession> {
    // Lazy import: keeps pi SDK out of the boot path (and out of the
    // packaged-app critical path until packaging of externals lands).
    const { PiSession } = await import("@peach-pi/pi-client");
    const session = await PiSession.create(
      cwd,
      {
        onOps: (ops) => this.queueOps(threadId, ops),
        onRunningChange: (running) => this.setStatus(threadId, running ? "running" : "completed"),
        onQueueChange: (steering, followUp) =>
          this.emit("event:queue", { threadId, steering, followUp }),
        onMetaChange: () => {
          const live = this.sessions.get(threadId);
          if (live) this.emit("event:sessionMeta", this.metaFor(threadId, live));
        },
        onExtensionDialog: (req) =>
          new Promise((resolve) => {
            const requestId = uuid();
            this.pendingDialogs.set(requestId, resolve);
            const settle = (value: string | boolean | undefined) =>
              this.respondExtensionUi(requestId, value);
            if (req.timeout) setTimeout(() => settle(undefined), req.timeout);
            req.signal?.addEventListener("abort", () => settle(undefined));
            this.emit("event:extensionUi", {
              threadId,
              requestId,
              kind: req.kind,
              title: req.title,
              message: req.message,
              options: req.options,
              placeholder: req.placeholder,
            });
          }),
        onExtensionNotify: (message, level) => {
          // Cymbal nudges are agent-internal guidance (also injected as a
          // hidden conversation message), so don't surface them as toasts.
          if (message.startsWith("Cymbal suggests:")) return;
          // Smart auto-compact status surfaces as an inline compaction card,
          // so suppress its toasts. The pipeline (pi-smart-compact) fires many
          // notify strings between compaction_start/end — gate on the live
          // compaction window rather than matching individual prefixes. The
          // wrapper's threshold/completed/failed notices fire just outside that
          // window, so keep the prefix filter for those.
          if (this.compacting.has(threadId)) return;
          if (message.startsWith("Smart auto-compact")) return;
          this.emit("event:notice", { threadId, message, level });
        },
        onExtensionStatus: (key, text) =>
          this.emit("event:extensionStatus", { threadId, key, text }),
        onExtensionWidget: (key, lines) =>
          this.emit("event:extensionWidget", { threadId, key, lines }),
        getAutoCompact: () => this.getAutoCompact(),
      },
      sessionFile ?? undefined,
    );
    if (session.sessionFile && session.sessionFile !== sessionFile) {
      this.threads.setSessionFile(threadId, session.sessionFile);
    }
    this.sessions.set(threadId, session);
    return session;
  }

  private setStatus(threadId: string, status: Thread["status"]): void {
    this.threads.setStatus(threadId, status);
    this.onThreadsChanged();
    if (status === "completed" && this.onRunIdle) {
      const thread = this.threads.get(threadId);
      if (thread) this.onRunIdle(thread);
    }
  }

  private queueOps(threadId: string, ops: TranscriptOp[]): void {
    for (const op of ops) {
      if (op.op === "upsert" && op.item.kind === "compaction") {
        if (op.item.running) this.compacting.add(threadId);
        else this.compacting.delete(threadId);
      }
    }
    const pending = this.pendingOps.get(threadId) ?? [];
    pending.push(...ops);
    this.pendingOps.set(threadId, pending);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  private flush(): void {
    this.flushTimer = null;
    for (const [threadId, ops] of this.pendingOps) {
      this.emit("event:transcript", { threadId, ops });
    }
    this.pendingOps.clear();
  }
}
