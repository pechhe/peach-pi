import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppThreadCollaborator,
  AutoCompactSettings,
  CommandInfo,
  ImagePayload,
  ModelInfo,
  ResourceInspection,
  SlotToggleSpec,
  CommandKind,
  SessionMeta,
  ThinkingLevel,
  Thread,
  ThreadSearchHit,
  ToolMode,
  TranscriptItem,
  TranscriptOp,
  TranscriptSnapshot,
  ThreadFrame,
  ThreadFrameListener,
} from "@peach-pi/shared-types";

import type { PiSession } from "@peach-pi/pi-client";
import type { GitService } from "./git-service.ts";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";
import { shouldSuppressNotice } from "./extension-notice-filter.ts";

/** Remote-handoff hook injected by main.ts. When remote-first mode is on,
 *  `beforePrompt` guarantees the conversation thread has been handed off to
 *  the remote machine before the prompt runs locally as controller. Returns a
 *  human status note (null = no handoff happened). */
export type HandoffHook = {
  beforePrompt: (threadId: string, task: string) => Promise<string | null>;
};

// Transcript-op flush cadence. 16ms (~60fps) was overkill for streaming text
// and drove ~60 IPC messages/sec to the renderer during runs; 50ms (~20fps)
// stays smooth for token streaming while cutting IPC ~3x.
const FLUSH_MS = 50;

/** Final prompt sent when a thread is parked for testing. The assistant's
 *  one-row markdown table reply is captured as the thread's test note and
 *  rendered as Feature / How-to-test columns in the Testing view. */
const PARK_FOR_TESTING_PROMPT =
  "Reply with ONLY a markdown table, no preamble. Columns: | Feature | Test |. " +
  "One row. Feature: what we built, one short sentence. Test: quickest way to " +
  "check it, one short sentence.";

/** The status to stamp a thread with when its run goes idle: "failed" if
 *  the most recent assistant message ended in error (connection drop, provider
 *  cutoff, out of tokens, etc.), otherwise "completed". The SDK does not
 *  reject prompt() for mid-stream provider failures — it emits message_end
 *  with stopReason "error" (and the recorder mirrors that as item.error),
 *  then agent_end — so onRunningChange(false) is the only signal we get.
 *  Without this check a failed run is indistinguishable from a clean finish. */
function runOutcome(items: TranscriptItem[]): Thread["status"] {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "assistant") return item.error ? "failed" : "completed";
  }
  return "completed";
}

/** Last assistant message text in a transcript, or undefined if none. */
function lastAssistantText(items: TranscriptItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "assistant" && item.text.trim()) return item.text.trim();
  }
  return undefined;
}

/** First user message in a transcript, or undefined if none. Used to label a
 *  thread from its actual opening prompt rather than whatever message later
 *  retriggers the title pass after an earlier (e.g. offline) failure. */
function firstUserMessage(items: TranscriptItem[]): string | undefined {
  for (const item of items) {
    if (item.kind === "user" && item.text.trim()) return item.text.trim();
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
  private onRunningChange?: (running: boolean) => void;
  private sessions = new Map<string, PiSession>();
  private pendingOps = new Map<string, TranscriptOp[]>();
  /** Threads with an in-flight compaction; their extension toasts are suppressed. */
  private compacting = new Set<string>();
  /** Threads queued for a hot-reload once their current run finishes. */
  private reloadQueued = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  /** Monotonic counter stamped on each emitted transcript flush; the boundary
   *  `getTranscript` reports so backfilling renderers can dedupe live deltas. */
  private transcriptSeq = 0;
  /** Pending extension dialog resolvers keyed by requestId. */
  private pendingDialogs = new Map<string, (value: string | boolean | undefined) => void>();
  /** Reads the persisted utility-model selection (titles/commits); null = defaults. */
  private getUtilityModel: () => ModelInfo | null;
  /** Reads the persisted auto-compaction thresholds. */
  private getAutoCompact: () => AutoCompactSettings;
  /** Git boundary for rewind file snapshots; injected post-construction. */
  private gitService: GitService | null = null;
  private handoff: HandoffHook | null = null;
  /** In-memory rewind snapshots: threadId → (prior-turn entryId | "root") → sha. */
  private rewindSnapshots = new Map<string, Map<string, string>>();
  /** Remote-subscriber seam (ADR-0009): the relay (and any future tap such
   *  as a DevTap recorder) registers here and receives every emission from
   *  one tagged-union site. Replaces the former 4-hook scatter-gather so a
   *  new frame type or a new subscriber touches one place, not five. */
  private frameListeners = new Set<ThreadFrameListener>();

  constructor(
    db: AppDb,
    emit: Emit,
    onThreadsChanged: () => void,
    chatsDir: string,
    onRunIdle?: (thread: Thread) => void,
    getUtilityModel?: () => ModelInfo | null,
    getAutoCompact?: () => AutoCompactSettings,
    onRunningChange?: (running: boolean) => void,
  ) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.emit = emit;
    this.onThreadsChanged = onThreadsChanged;
    this.chatsDir = chatsDir;
    this.onRunIdle = onRunIdle;
    this.onRunningChange = onRunningChange;
    this.getUtilityModel = getUtilityModel ?? (() => null);
    this.getAutoCompact = getAutoCompact ?? (() => ({ percent: 80, tokens: null }));
  }

  /** Wire the git boundary after construction (resolves service ordering). */
  setGitService(gitService: GitService): void {
    this.gitService = gitService;
  }

  /** App↔Thread collaborator (ADR-0015): the worktree/snapshot/archive subset
   *  of `AppService`, wired post-construction because the App↔Thread cycle
   *  forbids constructor injection. Typed by the named `AppThreadCollaborator`
   *  interface so drift between `AppService` and its mirror fails at compile
   *  time instead of silently breaking the orchestrators (issue #26). Null
   *  until `initAppCollaborator` runs; methods null-guard on purpose. */
  private appService: AppThreadCollaborator | null = null;
  private appCollaboratorInited = false;
  /** One-shot init of the App↔Thread collaborator. The cycle requires deferred
   *  wiring (both services built before either can hold the other), but the
   *  collaborator is set exactly once — re-wiring after the first init is a
   *  bug (drift mid-run), so it throws instead of silently overwriting. */
  initAppCollaborator(appService: AppThreadCollaborator): void {
    if (this.appCollaboratorInited) {
      throw new Error("AppThreadCollaborator already initialized");
    }
    this.appService = appService;
    this.appCollaboratorInited = true;
  }

  /** Wire the remote-handoff boundary after construction (service ordering):
   *  when remote-first mode is on, messaging a thread hands it off to the
   *  remote machine before the prompt runs. Optional — null by default. */
  setHandoffService(hs: HandoffHook | null): void {
    this.handoff = hs;
  }

  /** Register a subscriber to the in-process frame stream (ADR-0009's second
   *  subscriber seam). Returns a disposer so callers can detach. Any frame
   *  type added in future flows here with no edits to the emission paths. */
  subscribe(listener: ThreadFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Fan a frame out to every registered subscriber. Centralising emission here
   *  is the whole point of #14: each path calls one method instead of a hook
   *  per field, so a missed subscriber is impossible by construction. */
  private emitFrame(frame: ThreadFrame): void {
    if (this.frameListeners.size === 0) return;
    for (const listener of this.frameListeners) {
      try {
        listener(frame);
      } catch {
        // A faulty subscriber must never break the host's own stream.
      }
    }
  }

  /** Snapshot the working tree before a turn runs, keyed by the prior turn's
   *  entry id ("root" for the first). Awaited so the snapshot precedes any
   *  file edits the turn makes. No-op for non-repo chats. */
  private async captureRewindSnapshot(threadId: string, session: PiSession): Promise<void> {
    if (!this.gitService) return;
    const key = session.listTurns().at(-1)?.entryId ?? "root";
    const sha = await this.gitService.snapshot(threadId);
    if (!sha) return;
    const map = this.rewindSnapshots.get(threadId) ?? new Map<string, string>();
    map.set(key, sha); // last write from this leaf wins (freshest pre-turn state)
    this.rewindSnapshots.set(threadId, map);
  }

  private dropRewindSnapshots(threadId: string): void {
    // In-memory only; the dangling snapshot commits are left to git's normal
    // prune window (no refs written, so nothing leaks into the repo).
    this.rewindSnapshots.delete(threadId);
  }

  async createThread(
    projectId: string,
    opts?: { worktreeId?: string; worktree?: boolean },
  ): Promise<Thread> {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    let worktreeId: string | null = null;
    let worktreeDir: string | undefined;
    if (opts?.worktreeId) {
      const wt = this.appService?.worktree(opts.worktreeId);
      if (!wt) throw new Error(`Unknown worktree: ${opts.worktreeId}`);
      worktreeId = wt.id;
      worktreeDir = wt.dir;
    } else if (opts?.worktree) {
      // Legacy one-shot: create a worktree record + git checkout together.
      const dir = await this.gitService!.createWorktree(projectId);
      const wt = this.appService!.addWorktree(projectId, dir);
      worktreeId = wt.id;
      worktreeDir = wt.dir;
    }
    const thread = this.threads.insert({ projectId, title: "New thread", worktreeId, worktreeDir });
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

  /** Clone = fork the source thread's whole active branch (root→current leaf)
   *  into a new JSONL file. New thread inherits the source's environment
   *  (project / chat workspace / worktree). Source session is untouched. */
  async cloneThread(threadId: string): Promise<Thread> {
    return this.forkThread(threadId, null);
  }

  /** Fork = branch the source thread up to (but excluding) the given user
   *  message entry, into a new JSONL file. `entryId` is a user-message entry
   *  id (from `threads:listTurns`). The selected prompt is returned so the
   *  renderer can pre-fill the new thread's composer (pi `/fork` parity). */
  async forkFrom(threadId: string, entryId: string): Promise<{
    thread: Thread;
    editorText: string;
  }> {
    const session = await this.sessionFor(threadId);
    const turns = session.listTurns();
    const turn = turns.find((t) => t.entryId === entryId);
    if (!turn) throw new Error(`Unknown fork entry: ${entryId}`);
    // pi forks to the parent of the selected user message (position "before"):
    // the new thread contains history up to that point and the message text is
    // returned for composer pre-fill.
    const thread = await this.forkThread(threadId, entryId);
    return { thread, editorText: turn.text };
  }

  /** Shared fork backbone. `leafId = null` clones the whole active branch
   *  (pi `/clone`); a user-message entry id forks before it (pi `/fork`).
   *  Resolves the source's entry into `parentId` because pi's
   *  `createBranchedSession` walks root→leafId; forking "before" a user
   *  message means leafId = that message's parent. */
  private async forkThread(
    threadId: string,
    leafEntryId: string | null,
  ): Promise<Thread> {
    const source = this.threads.get(threadId)!;
    if (!source) throw new Error(`Unknown thread: ${threadId}`);
    if (!source.piSessionFile) {
      throw new Error("Cannot fork a thread with no session file yet");
    }
    const project = source.projectId
      ? this.projects.all().find((p) => p.id === source.projectId)
      : null;
    const cwd = project?.path ?? source.chatWorkspaceDir ?? process.cwd();
    // Resolve the leaf id: null/undefined → current leaf (clone). A user
    // message entry → its parent (fork-before). Two entry ids can collide
    // across the source and the fresh fork copy, so resolve against the
    // live source session before re-opening the file.
    let leafId: string | null = null;
    if (leafEntryId) {
      const session = await this.sessionFor(threadId);
      leafId = session.getEntryParentId(leafEntryId);
    }
    const thread = this.threads.insert({
      projectId: source.projectId,
      title: source.title ? `${source.title} (fork)` : "New thread",
      worktreeId: source.worktreeId,
      worktreeDir: source.worktreeDir,
      chatWorkspaceDir: source.chatWorkspaceDir,
    });
    await this.ensureSession(thread.id, cwd, null, {
      sourceFile: source.piSessionFile,
      leafId,
    });
    this.onThreadsChanged();
    return this.threads.get(thread.id)!;
  }

  async prompt(
    threadId: string,
    text: string,
    images?: ImagePayload[],
    toolMode?: ToolMode,
  ): Promise<void> {
    // Remote-first mode: hand the conversation thread to the remote machine
    // before running the prompt locally as controller. Non-blocking-safe: if
    // the remote is unreachable the prompt still runs (a notice is emitted).
    if (this.handoff) {
      try {
        const note = await this.handoff.beforePrompt(threadId, text);
        void note;
      } catch {
        // Swallowed: the hook itself surfaces warnings; the prompt continues.
      }
    }
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
    // (Re)run the title/tag pass until it succeeds. The tag is set exactly
    // once — on the first successful completion — so a null tag means the
    // pass has never stuck: a genuine first message, or an earlier attempt
    // that failed silently (e.g. while offline). Retry on every prompt until
    // it lands; once tagged it never re-enters here.
    if (!thread.tag) {
      // Keep the creation title ("New thread" / "New chat") until the LLM
      // pass lands. Prematurely stamping the full first prompt as the title
      // makes the top bar render the entire long message janky while the
      // rename is in flight. The overwrite guard in generateTitleAndTag
      // compares against this placeholder, so it still detects a manual
      // rename that happens before the LLM title arrives.
      void this.generateTitleAndTag(threadId, text);
    }
    // Snapshot the working tree before the run touches any files.
    await this.captureRewindSnapshot(threadId, session);
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

  /** Async LLM title + tag (one call). Classifies from the thread's first
   *  user message — `fallbackPrompt` (the message that triggered this pass)
   *  is used only on a genuine first prompt, where the message isn't in the
   *  transcript yet. Overwrites the title only if untouched since; the tag is
   *  applied once and never reclassified. */
  private async generateTitleAndTag(threadId: string, fallbackPrompt: string): Promise<void> {
    const placeholder = this.threads.get(threadId)?.title;
    if (!placeholder) return;
    const config = this.getUtilityModel();
    const session = this.sessions.get(threadId);
    const firstPrompt = firstUserMessage(session?.transcript() ?? []) ?? fallbackPrompt;
    const { generateTitleAndTag } = await import("@peach-pi/pi-client");
    const result = await generateTitleAndTag(firstPrompt, {
      config,
      onError: (reason) => this.emit("event:notice", {
        threadId,
        message: `Thread title generation failed — ${reason} Click to choose a utility model.`,
        level: "warning",
        action: { label: "Go to settings", target: "utility-model" },
      }),
    });
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

  async deleteFollowUp(threadId: string, index: number): Promise<void> {
    await (await this.sessionFor(threadId)).deleteFollowUp(index);
  }

  async deleteSteer(threadId: string, index: number): Promise<void> {
    await (await this.sessionFor(threadId)).deleteSteer(index);
  }

  /** Run an extension/slash command in the live session (executes immediately). */
  async runCommand(threadId: string, command: string): Promise<void> {
    const session = await this.sessionFor(threadId);
    void session
      .prompt(command)
      .catch((err) => {
        this.queueOps(threadId, [
          {
            op: "upsert",
            item: { id: `err-${Date.now()}`, kind: "notice", text: `Command failed: ${String(err)}` },
          },
        ]);
      })
      // Clear any `custom()` TUI overlay the command left open.
      .finally(() => session.closeTerminalCustom());
  }

  /** Forward a keystroke to a live extension `custom()` TUI component. */
  terminalCustomInput(threadId: string, requestId: string, data: string): void {
    this.sessions.get(threadId)?.terminalCustomInput(requestId, data);
  }

  /** Cancel a live extension `custom()` TUI component (esc / overlay close). */
  terminalCustomCancel(threadId: string, requestId: string): void {
    this.sessions.get(threadId)?.cancelTerminalCustom(requestId);
  }

  async abort(threadId: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session) await session.abort();
  }

  async getTranscript(threadId: string): Promise<TranscriptSnapshot> {
    const session = await this.sessionFor(threadId);
    // Flush pending ops first so the snapshot sits exactly on a flush boundary:
    // every delta the renderer buffers during this round-trip then carries a
    // strictly greater seq, so dedupe is exact (no dropped or doubled ops).
    this.flush();
    return { items: session.transcript(), seq: this.transcriptSeq };
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

  /** Reload settings.json in every live session + republish each meta.
   *  Called after the global scope changes from the thread-free Settings UI. */
  async reloadScopedModels(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((s) => s.reloadSettings().catch(() => {})),
    );
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

  async retryCompact(threadId: string): Promise<void> {
    (await this.sessionFor(threadId)).retryCompact();
  }

  /** User turns available as rewind targets, in branch order. */
  async listTurns(threadId: string): Promise<{ entryId: string; text: string }[]> {
    return (await this.sessionFor(threadId)).listTurns();
  }

  /** Rewind the conversation to before a turn. Emits a transcript reset + meta
   *  update via the session callbacks; returns the rewound prompt text. */
  async rewind(
    threadId: string,
    entryId: string,
    revertFiles = false,
  ): Promise<{ editorText?: string }> {
    const session = await this.sessionFor(threadId);
    if (revertFiles && this.gitService) {
      // Restore to the state *before* this turn ran = snapshot keyed by the
      // predecessor turn (or "root" when rewinding the first turn).
      const turns = session.listTurns();
      const idx = turns.findIndex((t) => t.entryId === entryId);
      const key = idx > 0 ? turns[idx - 1]!.entryId : "root";
      const sha = this.rewindSnapshots.get(threadId)?.get(key);
      if (sha) await this.gitService.restoreSnapshot(threadId, sha);
    }
    const result = await session.rewind(entryId);
    this.onThreadsChanged();
    return result;
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

  async inspectSlotCommand(
    projectId: string | null,
    kind: CommandKind,
    name: string,
  ): Promise<SlotToggleSpec | null> {
    const project = projectId ? this.projects.all().find((p) => p.id === projectId) : null;
    const cwd = project?.path ?? this.chatsDir;
    const config = this.getUtilityModel();
    const { inspectCommandToggle } = await import("@peach-pi/pi-client");
    return inspectCommandToggle(cwd, kind, name, config, (reason) =>
      this.emit("event:notice", {
        message: `Couldn't inspect "${name}" — ${reason}`,
        level: "warning",
        action: { label: "Go to settings", target: "utility-model" },
      }),
    );
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

  /** Flip an empty (never-prompted) thread between its project dir and an
   *  isolated worktree, keeping the same thread id so the renderer's
   *  ThreadView stays mounted (no flash). Owns the full resolve/teardown
   *  choreography sunk from main.ts's `threads:setEnvironment` handler
   *  (issue #15): creating a fresh worktree on enable, tearing down the old
   *  worktree record + git checkout on disable. */
  async setEnvironment(threadId: string, worktree: boolean): Promise<void> {
    const before = this.threads.get(threadId);
    if (!before?.projectId) return;
    if ((before.worktreeDir != null) === worktree) return;
    if (worktree) {
      // Resolve a freshly-created worktree record + dir before disposing.
      const dir = await this.gitService!.createWorktree(before.projectId);
      const wt = this.appService!.addWorktree(before.projectId, dir);
      await this.swapEnvironment(threadId, wt.id, wt.dir);
    } else {
      await this.swapEnvironment(threadId, null, undefined);
      // Tear down the old worktree record + git checkout.
      if (before.worktreeId) {
        const project = this.projects.all().find((p) => p.id === before.projectId);
        if (project && before.worktreeDir) {
          await this.gitService!.removeWorktree(project.path, before.worktreeDir);
        }
        this.appService!.archiveWorktree(before.worktreeId);
      }
    }
  }

  /** Low-level session swap + row mutation. Shared by `setEnvironment`
   *  (worktree flip) and `bringWorktreeToLocal` (detach). */
  private async swapEnvironment(
    threadId: string,
    worktreeId: string | null,
    worktreeDir: string | undefined,
  ): Promise<void> {
    this.disposeSession(threadId);
    this.threads.setWorktree(threadId, worktreeId, worktreeDir ?? null);
    const thread = this.threads.get(threadId);
    if (thread) {
      const project = thread.projectId
        ? this.projects.all().find((p) => p.id === thread.projectId)
        : null;
      const cwd = worktreeDir ?? project?.path ?? thread.chatWorkspaceDir ?? process.cwd();
      await this.ensureSession(threadId, cwd, null);
    }
    this.onThreadsChanged();
  }

  /** Detach a worktree thread from its worktree, keeping the conversation:
   *  clear worktreeDir and resume the same pi session in the project dir.
   *  Caller removes the now-orphaned worktree dir. */
  async bringWorktreeToLocal(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread?.worktreeDir) return;
    this.disposeSession(threadId);
    this.threads.setWorktree(threadId, null, null);
    const project = thread.projectId
      ? this.projects.all().find((p) => p.id === thread.projectId)
      : null;
    const cwd = project?.path ?? thread.chatWorkspaceDir ?? process.cwd();
    await this.ensureSession(threadId, cwd, thread.piSessionFile);
    this.onThreadsChanged();
  }

  private disposeSession(threadId: string): void {
    this.dropRewindSnapshots(threadId);
    const session = this.sessions.get(threadId);
    if (session) {
      session.dispose();
      this.sessions.delete(threadId);
    }
  }

  /** Hot-reload one session's extensions/skills/prompts/themes from disk via
   *  the SDK's `AgentSession.reload()`. Refuses if the thread is currently
   *  running (reload invalidates in-flight ctxs). */
  async reloadSession(threadId: string): Promise<{ ok: boolean; error?: string }> {
    const session = this.sessions.get(threadId);
    if (!session) {
      // Nothing loaded yet — nothing to reload. The next prompt loads fresh.
      return { ok: true };
    }
    if (session.isStreaming) {
      return { ok: false, error: "Cannot reload while a run is in progress." };
    }
    try {
      await session.reload();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /** Reload every idle session in parallel, and queue a reload for every
   *  running session (flushed automatically when its run finishes). Returns counts. */
  async reloadIdleSessions(): Promise<{ reloaded: string[]; queued: string[] }> {
    const reloaded: string[] = [];
    const queued: string[] = [];
    const tasks: Promise<void>[] = [];
    for (const [threadId, session] of this.sessions) {
      if (session.isStreaming) {
        this.reloadQueued.add(threadId);
        queued.push(threadId);
        continue;
      }
      tasks.push(
        session.reload().then(() => { reloaded.push(threadId); }).catch(() => {}),
      );
    }
    await Promise.all(tasks);
    return { reloaded, queued };
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
    forkFrom?: { sourceFile: string; leafId: string | null },
  ): Promise<PiSession> {
    // Lazy import: keeps pi SDK out of the boot path (and out of the
    // packaged-app critical path until packaging of externals lands).
    const { PiSession } = await import("@peach-pi/pi-client");
    const session = await PiSession.create(
      cwd,
      {
        onOps: (ops) => this.queueOps(threadId, ops),
        onRunningChange: (running) =>
          this.setStatus(threadId, running ? "running" : this.runOutcome(threadId)),
        onQueueChange: (steering, followUp) => {
          this.emit("event:queue", { threadId, steering, followUp });
          this.emitFrame({ kind: "queue", threadId, steering, followUp });
        },
        onMetaChange: () => {
          const live = this.sessions.get(threadId);
          if (live) this.emit("event:sessionMeta", this.metaFor(threadId, live));
        },
        onExtensionDialog: (req) =>
          new Promise((resolve) => {
            const requestId = randomUUID();
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
          if (shouldSuppressNotice(message, level, { compacting: this.compacting.has(threadId) }))
            return;
          this.emit("event:notice", { threadId, message, level });
        },
        onExtensionStatus: (key, text) =>
          this.emit("event:extensionStatus", { threadId, key, text }),
        onExtensionWidget: (key, lines) =>
          this.emit("event:extensionWidget", { threadId, key, lines }),
        onTerminalCustomFrame: (frame) =>
          this.emit("event:terminalCustom", { threadId, ...frame }),
        getAutoCompact: () => this.getAutoCompact(),
        onToolStart: () => {
          // Environment pinning: previously this hook detected an agent's
          //  `git worktree add -b <branch> <path>` and auto-adopted the path as
          //  the thread's worktree dir, so the git widget would mirror where
          //  commits actually land. That re-pointed a thread's cwd out from
          //  under it — a thread could self-switch its environment, bypassing
          //  the isolation boundary the user chose at creation. Threads must
          //  stay pinned to whatever cwd they were created with (the shared
          //  project checkout for a local thread, or a managed worktree dir).
          //  Adoption is now user-driven only (the worktree flip / detach UI).
        },
      },
      forkFrom
        ? { forkFrom: { sourceFile: forkFrom.sourceFile, leafId: forkFrom.leafId } }
        : sessionFile
          ? { sessionFile }
          : undefined,
    );
    if (forkFrom && session.sessionFile) {
      // Forked sessions always get a fresh file path; persist it.
      this.threads.setSessionFile(threadId, session.sessionFile);
    } else if (session.sessionFile && session.sessionFile !== sessionFile) {
      this.threads.setSessionFile(threadId, session.sessionFile);
    }
    this.sessions.set(threadId, session);
    return session;
  }

  /** Resolve the idle status for a thread's just-finished run from its
   *  transcript's last assistant message (see runOutcome). Falls back to
   *  "completed" when the session/transcript is unavailable (e.g. the run
   *  never produced an assistant message, or the session was torn down). */
  private runOutcome(threadId: string): Thread["status"] {
    const session = this.sessions.get(threadId);
    if (!session) return "completed";
    return runOutcome(session.transcript());
  }

  private setStatus(threadId: string, status: Thread["status"]): void {
    const prev = this.threads.get(threadId)?.status;
    const wasRunning = prev === "running";
    const nowRunning = status === "running";
    this.threads.setStatus(threadId, status);
    this.onThreadsChanged();
    this.emitFrame({ kind: "status", threadId, status });
    if (wasRunning !== nowRunning && this.onRunningChange) this.onRunningChange(nowRunning);
    if (status === "completed" && this.onRunIdle) {
      const thread = this.threads.get(threadId);
      if (thread) this.onRunIdle(thread);
    }
    if (status === "completed") {
      // Idle→checkpoint frame: subscribers (e.g. the relay) record the wip/
      // branch. Kept as a frame, not a separate hook, so a new subscriber gets
      // it for free.
      this.emitFrame({
        kind: "idle",
        threadId,
        cwd: this.gitService?.cwdFor(threadId) ?? null,
      });
    }
    // Flush a queued hot-reload now that this thread's run has finished.
    if (status === "completed" && this.reloadQueued.has(threadId)) {
      this.reloadQueued.delete(threadId);
      const session = this.sessions.get(threadId);
      if (session && !session.isStreaming) {
        void session.reload().catch(() => {});
      }
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
      const delta = { threadId, ops, seq: ++this.transcriptSeq };
      this.emit("event:transcript", delta);
      this.emitFrame({ kind: "transcript", threadId, ops, seq: delta.seq });
    }
    this.pendingOps.clear();
  }
}
