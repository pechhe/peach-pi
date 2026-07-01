import { basename } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type {
  AppSnapshot,
  AutoCompactSettings,
  AutomationModel,
  ModelInfo,
  Project,
  SnapshotPatch,
  ThinkingLevel,
  Thread,
  UiState,
  Worktree,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { seedHudThreadId } from "@peach-pi/shared-types";
import {
  AutomationRepo,
  REMOTE_CLIENT_ID_KV_KEY,
  UTILITY_MODEL_KV_KEY,
  defaultUiState,
  KvRepo,
  ProjectRepo,
  ThreadRepo,
  WorktreeRepo,
} from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";
import { getAutoCompactThresholds, setAutoCompactThresholds } from "./pi-smart-compact.ts";

const UI_STATE_KEY = "ui-state";

/** Owns app state; publishes snapshots after every mutation. */
export class AppService {
  private projects: ProjectRepo;
  private threads: ThreadRepo;
  private worktrees: WorktreeRepo;
  private kv: KvRepo;
  private automations: AutomationRepo;
  private snoozeTimer: NodeJS.Timeout | null = null;
  /** Coalesced publish timer: bursts of mutations (sidebar drag, streaming-
   *  driven onThreadsChanged callbacks, rapid status flips) collapse into one
   *  `event:snapshotPatch` emit so the diff isn't re-run ~60x/sec. */
  private publishTimer: NodeJS.Timeout | null = null;
  private emit: Emit;
  /** Collaborators for worktree teardown (archive a worktree → archive its
   *  threads → remove the git dir). Injected post-construction to avoid the
   *  App↔Thread cycle; the orchestration lives here because the worktree
   *  lifecycle is owned by AppService (issue #15). */
  private threadService: { archive: (threadId: string) => void } | null = null;
  private gitService: {
    removeWorktree: (projectPath: string, worktreeDir: string) => Promise<void>;
  } | null = null;
  /** Supplies synthetic threads mirrored from remote masters (set by main.ts),
   *  merged into the snapshot so they render in the sidebar tagged as remote. */
  private remoteThreads: () => Thread[] = () => [];
  /** Main-process listener fired when a thread is opened/seen (see
   *  `setSelectedThread`). The notch registers here to clear its unread inbox
   *  when the user opens a finished thread in the app, not just via the notch. */
  private threadSeenListener: ((threadId: string) => void) | null = null;
  /** The last snapshot the renderer is known to hold, with stable entity refs.
   *  Each publish diffs the freshly-queried `snapshot()` against this and emits
   *  only changed entities on `event:snapshotPatch`; this is where identity is
   *  owned (at the source), so the renderer no longer reconstructs it. Null
   *  until the first publish, which emits a full-replacement patch. */
  private lastEmitted: AppSnapshot | null = null;

  constructor(db: AppDb, emit: Emit) {
    this.emit = emit;
    this.projects = new ProjectRepo(db);
    this.threads = new ThreadRepo(db);
    this.worktrees = new WorktreeRepo(db);
    this.kv = new KvRepo(db);
    this.automations = new AutomationRepo(db);
  }

  start(): void {
    // Reap ghost `running` threads left by a prior crashed/quit session —
    // their backing pi process is gone, so they must not keep gating skill /
    // extension deletes or `pi update` (see resetStaleRunning).
    const reaped = this.threads.resetStaleRunning();
    if (reaped) console.warn(`[app] reaped ${reaped} stale running thread(s)`);
    // Auto-return snoozed threads to active (60s poll, utility).
    this.snoozeTimer = setInterval(() => this.wakeExpiredSnoozes(), 60_000);
    this.wakeExpiredSnoozes();
  }

  stop(): void {
    if (this.snoozeTimer) clearInterval(this.snoozeTimer);
    if (this.publishTimer) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
  }

  /** Register the provider of remote-master threads (RemoteClientService). */
  setRemoteThreadsProvider(provider: () => Thread[]): void {
    this.remoteThreads = provider;
  }

  /** Wire the collaborators for full worktree archive (teardown choreography
   *  that previously lived inline in main.ts's `worktrees:archive` handler).
   *  Issue #15: sink the orchestrator into the service that owns the lifecycle. */
  setTeardownCollaborators(c: {
    threadService: { archive: (threadId: string) => void };
    gitService: {
      removeWorktree: (projectPath: string, worktreeDir: string) => Promise<void>;
    };
  }): void {
    this.threadService = c.threadService;
    this.gitService = c.gitService;
  }

  /** This machine's stable client identity for remote steering leases + archive
   *  attribution (ADR-0011). Lazily generated, persisted in KV. */
  getRemoteClientId(): { id: string; name: string } {
    let id = this.kv.get<string>(REMOTE_CLIENT_ID_KV_KEY);
    if (!id) {
      id = randomUUID();
      this.kv.set(REMOTE_CLIENT_ID_KV_KEY, id);
    }
    return { id, name: hostname() };
  }

  snapshot(): AppSnapshot {
    return {
      projects: this.projects.all(),
      worktrees: this.worktrees.all(),
      threads: [...this.threads.all(), ...this.remoteThreads()],
      automations: this.automations.all(),
      ui: this.loadUiState(),
    };
  }

  /** Merge persisted UiState over defaults so newly-added fields (like
   *  collapsedProjects) always have a value, even for older state blobs. */
  private loadUiState(): UiState {
    const persisted = this.kv.get<Partial<UiState>>(UI_STATE_KEY) ?? {};
    return { ...defaultUiState, ...persisted } as UiState;
  }

  private saveUiState(patch: Partial<UiState>): void {
    this.kv.set(UI_STATE_KEY, { ...this.loadUiState(), ...patch });
  }

  addProject(path: string): Project {
    const kind = existsSync(`${path}/.git`) ? "repo" : "folder";
    const project = this.projects.add(path, basename(path), kind);
    this.notify();
    return project;
  }

  removeProject(id: string): void {
    this.projects.remove(id);
    this.saveUiState({
      collapsedProjects: this.loadUiState().collapsedProjects.filter((cid) => cid !== id),
    });
    this.notify();
  }

  /** Persist a new sidebar order (full ordered list of project IDs). */
  reorderProjects(orderedIds: string[]): void {
    this.projects.reorder(orderedIds);
    this.notify();
  }

  /** Collapse/expand a project's thread list in the sidebar. */
  setProjectCollapsed(projectId: string, collapsed: boolean): void {
    const collapsedProjects = new Set(this.loadUiState().collapsedProjects);
    if (collapsed) collapsedProjects.add(projectId);
    else collapsedProjects.delete(projectId);
    this.saveUiState({ collapsedProjects: [...collapsedProjects] });
    this.notify();
  }

  /** Set a project's Work Queue merge workflow ('pr' | 'local'). Returns the
   *  updated project; throws if the project id is unknown. */
  setMergeWorkflow(projectId: string, workflow: "pr" | "local"): Project {
    const exists = this.projects.all().some((p) => p.id === projectId);
    if (!exists) throw new Error(`Unknown project: ${projectId}`);
    this.projects.setMergeWorkflow(projectId, workflow);
    this.notify();
    return this.projects.all().find((p) => p.id === projectId)!;
  }

  /** Set a project's check command (run in the worktree before local merges).
   *  Empty/whitespace clears it. Returns the updated project. */
  setCheckCommand(projectId: string, command: string | null): Project {
    const exists = this.projects.all().some((p) => p.id === projectId);
    if (!exists) throw new Error(`Unknown project: ${projectId}`);
    this.projects.setCheckCommand(projectId, command?.trim() || null);
    this.notify();
    return this.projects.all().find((p) => p.id === projectId)!;
  }

  /** Pin the model Work Queue agents use for this project. null = pi default. */
  setAgentModel(projectId: string, model: AutomationModel | null): Project {
    const exists = this.projects.all().some((p) => p.id === projectId);
    if (!exists) throw new Error(`Unknown project: ${projectId}`);
    this.projects.setAgentModel(projectId, model);
    this.notify();
    return this.projects.all().find((p) => p.id === projectId)!;
  }

  /** Pin the reasoning level Work Queue agents use. null = pi default. */
  setAgentThinking(projectId: string, level: ThinkingLevel | null): Project {
    const exists = this.projects.all().some((p) => p.id === projectId);
    if (!exists) throw new Error(`Unknown project: ${projectId}`);
    this.projects.setAgentThinking(projectId, level);
    this.notify();
    return this.projects.all().find((p) => p.id === projectId)!;
  }

  /** Persist the sidebar width (clamped to a sane range). */
  setSidebarWidth(width: number): void {
    this.saveUiState({ sidebarWidth: Math.round(Math.min(560, Math.max(200, width))) });
    this.notify();
  }

  /** Persist whether the sidebar is collapsed (hidden, reveal-on-hover). */
  setSidebarCollapsed(collapsed: boolean): void {
    this.saveUiState({ sidebarCollapsed: collapsed });
    this.notify();
  }

  addWorktree(projectId: string, dir: string, name?: string): Worktree {
    const wt = this.worktrees.insert({
      projectId,
      dir,
      name: name ?? this.worktrees.nextName(projectId),
    });
    this.notify();
    return wt;
  }

  worktree(id: string): Worktree | null {
    return this.worktrees.get(id);
  }

  renameWorktree(id: string, name: string): void {
    this.worktrees.setName(id, name);
    this.notify();
  }

  /** Mark a worktree archived; returns its live (non-archived) thread ids so
   *  the caller can archive each thread + remove the git worktree dir. */
  archiveWorktree(id: string): string[] {
    const now = new Date().toISOString();
    this.worktrees.setArchived(id, now);
    const threadIds = this.threads.all()
      .filter((t) => t.worktreeId === id && !t.archivedAt)
      .map((t) => t.id);
    this.notify();
    return threadIds;
  }

  /** Full worktree lifecycle teardown: archive every live thread in it, remove
   *  the git worktree dir, then mark the worktree record archived. Sinks the
   *  `worktrees:archive` orchestrator out of main.ts (issue #15). Requires the
   *  teardown collaborators wired via `setTeardownCollaborators`; no-ops the
   *  git/thread steps gracefully when they're unset (e.g. in unit tests). */
  async archive(worktreeId: string): Promise<void> {
    const wt = this.worktree(worktreeId);
    if (!wt) return;
    const project = this.projects.all().find((p) => p.id === wt.projectId);
    const threadIds = this.archiveWorktree(worktreeId);
    for (const tid of threadIds) this.threadService?.archive(tid);
    if (project && this.gitService) await this.gitService.removeWorktree(project.path, wt.dir);
  }

  setSelectedThread(threadId: string | null): void {
    this.saveUiState({ selectedThreadId: threadId });
    if (threadId) {
      this.threads.markSeen(threadId);
      this.threadSeenListener?.(threadId);
    }
    this.notify();
  }

  /** Register a main-process "thread opened/seen" listener. Fires from
   *  `setSelectedThread`, mirroring `markSeen`, so surfaces outside the
   *  renderer (the notch) can drop the thread's unread accent too. */
  onThreadSeen(listener: (threadId: string) => void): void {
    this.threadSeenListener = listener;
  }

  /** Read the HUD's active thread (independent of `selectedThreadId`). */
  getHudThreadId(): string | null {
    return this.loadUiState().hudThreadId;
  }

  /** Point the HUD at a thread. Does NOT touch the Main Window selection. */
  setHudThread(threadId: string | null): void {
    this.saveUiState({ hudThreadId: threadId });
    this.notify();
  }

  /**
   * Seed the HUD thread from the Main Window selection on open, preserving any
   * thread the HUD is already tracking. Returns the resolved id.
   */
  seedHudThread(): string | null {
    const ui = this.loadUiState();
    const seeded = seedHudThreadId(ui.hudThreadId, ui.selectedThreadId);
    if (seeded !== ui.hudThreadId) this.setHudThread(seeded);
    return seeded;
  }

  getHudPosition(): { x: number; y: number } | null {
    return this.loadUiState().hudPosition;
  }

  setHudPosition(x: number, y: number): void {
    this.saveUiState({ hudPosition: { x: Math.round(x), y: Math.round(y) } });
    // No publish: window geometry is not renderer state.
  }

  getHudAutoReveal(): boolean {
    return this.loadUiState().hudAutoRevealOnFinish;
  }

  setHudAutoReveal(on: boolean): void {
    this.saveUiState({ hudAutoRevealOnFinish: on });
    this.notify();
  }

  /** Read the persisted "don't warn me" flag for archiving a sole-thread
   *  worktree alongside its thread. */
  getArchiveThreadWorktreeWarningDismissed(): boolean {
    return this.loadUiState().archiveThreadWorktreeWarningDismissed;
  }

  /** Persist the "don't warn me again" flag for the sole-thread worktree
   *  archive dialog. No publish: this is a UI preference, not renderer state. */
  setArchiveThreadWorktreeWarningDismissed(dismissed: boolean): void {
    this.saveUiState({ archiveThreadWorktreeWarningDismissed: dismissed });
  }

  snoozeThread(threadId: string, until: string): void {
    this.threads.setSnoozedUntil(threadId, until);
    this.notify();
  }

  unsnoozeThread(threadId: string): void {
    this.threads.setSnoozedUntil(threadId, null);
    this.notify();
  }

  unmarkToTest(threadId: string): void {
    this.threads.setToTest(threadId, null, null);
    this.notify();
  }

  /** All auth-configured models (global). Lazy import keeps pi SDK out of boot path. */
  async listModels(): Promise<ModelInfo[]> {
    const { listAvailableModels } = await import("@peach-pi/pi-client");
    return listAvailableModels();
  }

  getUtilityModel(): ModelInfo | null {
    return this.kv.get<ModelInfo>(UTILITY_MODEL_KV_KEY);
  }

  setUtilityModel(model: ModelInfo | null): ModelInfo | null {
    if (model) this.kv.set(UTILITY_MODEL_KV_KEY, model);
    else this.kv.set(UTILITY_MODEL_KV_KEY, null);
    return this.getUtilityModel();
  }

  /** Auto-compaction thresholds. Backed by the `smartCompact` block in
   *  `~/.pi/agent/settings.json` — the single source of truth the
   *  `pi-smart-auto-compact` extension actually enforces — so the Settings UI
   *  and context-bar marker reflect the real trigger (previously these read a
   *  KV key nothing consumed). */
  getAutoCompact(): AutoCompactSettings {
    return getAutoCompactThresholds();
  }

  setAutoCompact(settings: AutoCompactSettings): AutoCompactSettings {
    return setAutoCompactThresholds(settings);
  }

  private wakeExpiredSnoozes(): void {
    const woken = this.threads.clearExpiredSnoozes(new Date().toISOString());
    if (woken.length > 0) this.notify();
  }

  /** Schedule a coalesced snapshot-patch emit. External collaborators (ThreadService
   *  via onThreadsChanged, automations, remote relay) call this instead of
   *  emitting `event:snapshotPatch` directly so hot paths share one debounce. */
  notify(): void {
    if (this.publishTimer) return;
    // 0-delay: coalesces all calls within the current macrotask into one
    // emit, and naturally bounds steady-state (~1000/sec max → same tick).
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      const next = this.snapshot();
      const patch = this.diff(this.lastEmitted, next);
      // Empty diff (e.g. a notify() with no underlying state change) → no
      // emit, so reactive consumers don't invalidate for nothing.
      if (patch) this.emit("event:snapshotPatch", patch);
      this.lastEmitted = next;
    }, 0);
  }

  /** Diff `next` against `prev` (the last-emitted snapshot, with stable refs)
   *  and return the entity-scoped patch, or null when nothing changed.
   *  `prev` null (first publish, or post-reset) → full-replacement patch.
   *  Identity is owned here: an unchanged entity reuses the `prev` ref so the
   *  renderer never sees a new ref for it. */
  private diff(prev: AppSnapshot | null, next: AppSnapshot): SnapshotPatch | null {
    if (!prev) {
      // First publish: emit everything so the renderer converges regardless
      // of whether its `app:getSnapshot` initial load has landed yet.
      return {
        threads: { upserts: byId(next.threads), order: ids(next.threads) },
        projects: { upserts: byId(next.projects), order: ids(next.projects) },
        worktrees: { upserts: byId(next.worktrees), order: ids(next.worktrees) },
        automations: { upserts: byId(next.automations), order: ids(next.automations) },
        ui: next.ui,
      };
    }
    let patch: SnapshotPatch = {};
    const t = diffCollection(prev.threads, next.threads);
    if (t) patch.threads = t;
    const p = diffCollection(prev.projects, next.projects);
    if (p) patch.projects = p;
    const w = diffCollection(prev.worktrees, next.worktrees);
    if (w) patch.worktrees = w;
    const a = diffCollection(prev.automations, next.automations);
    if (a) patch.automations = a;
    const ui = diffUi(prev.ui, next.ui);
    if (ui) patch.ui = ui;
    return hasKeys(patch) ? patch : null;
  }
}

// ── patch-diff helpers (entity-shape knowledge lives here, at the source) ──

interface Keyed {
  id: string;
}

function byId<T extends Keyed>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const e of list) out[e.id] = e;
  return out;
}

function ids<T extends Keyed>(list: T[]): string[] {
  return list.map((e) => e.id);
}

/** Shallow field-by-field comparison over an entity. Same semantics as the old
 *  renderer `shallowEqualThread` — now in one place (main) so the renderer no
 *  longer holds entity-shape knowledge. */
function shallowEqualEntity<T>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k of ka) {
    const av = ra[k];
    const bv = rb[k];
    if (av === bv) continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
    } else {
      return false;
    }
  }
  return true;
}

/** Diff one collection against its prev (stable refs). Returns the patch when
 *  any entity changed or the id sequence changed (add/remove/reorder). */ 
function diffCollection<T extends Keyed>(
  prev: T[],
  next: T[],
): { upserts?: Record<string, T>; order?: string[] } | null {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const upserts: Record<string, T> = {};
  let orderChanged = false;
  if (prev.length !== next.length) orderChanged = true;
  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) {
      upserts[n.id] = n;
      orderChanged = true;
    } else if (!shallowEqualEntity(p, n)) {
      upserts[n.id] = n;
    }
  }
  if (!orderChanged) {
    // Reorder detection: compare the id sequence (covers add/remove already
    // caught via length; also catches pure reordering of unchanged entities).
    const prevSeq = prev.map((e) => e.id).join("\0");
    const nextSeq = next.map((e) => e.id).join("\0");
    if (prevSeq !== nextSeq) orderChanged = true;
  }
  const hasUpserts = Object.keys(upserts).length > 0;
  if (!orderChanged && !hasUpserts) return null;
  const patch: { upserts?: Record<string, T>; order?: string[] } = {};
  if (hasUpserts) patch.upserts = upserts;
  if (orderChanged) patch.order = next.map((e) => e.id);
  return patch;
}

/** Field-level diff of UiState: returns only changed top-level fields. */
function diffUi(prev: UiState, next: UiState): Partial<UiState> | null {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof UiState)[]) {
    const pv = prev[k];
    const nv = next[k];
    if (pv === nv) continue;
    if (Array.isArray(pv) && Array.isArray(nv)) {
      if (pv.length === nv.length && pv.every((v, i) => v === nv[i])) continue;
    } else if (
      pv && nv && typeof pv === "object" && typeof nv === "object"
    ) {
      const ka = Object.keys(pv);
      const kb = Object.keys(nv as object);
      if (
        ka.length === kb.length &&
        ka.every((kk) => (pv as Record<string, unknown>)[kk] === (nv as Record<string, unknown>)[kk])
      ) continue;
    }
    patch[k as string] = nv;
  }
  return Object.keys(patch).length > 0 ? (patch as Partial<UiState>) : null;
}

function hasKeys(o: object): boolean {
  return Object.keys(o).length > 0;
}
