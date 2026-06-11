import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CommandInfo,
  ImagePayload,
  ModelInfo,
  SessionMeta,
  ThinkingLevel,
  Thread,
  ToolMode,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";
import type { PiSession } from "@peach-pi/pi-client";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

const FLUSH_MS = 16;

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
  private sessions = new Map<string, PiSession>();
  private pendingOps = new Map<string, TranscriptOp[]>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(db: AppDb, emit: Emit, onThreadsChanged: () => void, chatsDir: string) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.emit = emit;
    this.onThreadsChanged = onThreadsChanged;
    this.chatsDir = chatsDir;
  }

  async createThread(projectId: string): Promise<Thread> {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const thread = this.threads.insert({ projectId, title: "New thread" });
    await this.ensureSession(thread.id, project.path, null);
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
    if (thread.title === "New thread" || thread.title === "New chat") {
      this.threads.setTitle(threadId, text.length > 60 ? `${text.slice(0, 60)}…` : text);
      this.onThreadsChanged();
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

  async steer(threadId: string, text: string): Promise<void> {
    await (await this.sessionFor(threadId)).steer(text);
  }

  async abort(threadId: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session) await session.abort();
  }

  async getTranscript(threadId: string): Promise<TranscriptItem[]> {
    return (await this.sessionFor(threadId)).transcript();
  }

  async listCommands(threadId: string): Promise<CommandInfo[]> {
    return (await this.sessionFor(threadId)).commands();
  }

  async listModels(threadId: string): Promise<ModelInfo[]> {
    return (await this.sessionFor(threadId)).listModels();
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
        onRunningChange: (running) => this.setStatus(threadId, running ? "running" : "idle"),
        onQueueChange: (steering, followUp) =>
          this.emit("event:queue", { threadId, steering, followUp }),
        onMetaChange: () => {
          const live = this.sessions.get(threadId);
          if (live) this.emit("event:sessionMeta", this.metaFor(threadId, live));
        },
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
  }

  private queueOps(threadId: string, ops: TranscriptOp[]): void {
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
