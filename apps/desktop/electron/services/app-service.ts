import { basename } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type {
  AppSnapshot,
  AutoCompactSettings,
  ModelInfo,
  Project,
  Thread,
  UiState,
  Worktree,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { seedHudThreadId } from "@peach-pi/shared-types";
import {
  AUTO_COMPACT_KV_KEY,
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

const UI_STATE_KEY = "ui-state";

/** Default auto-compaction thresholds (matches the historical 80% behaviour). */
const DEFAULT_AUTO_COMPACT: AutoCompactSettings = { percent: 80, tokens: null };

/** Owns app state; publishes snapshots after every mutation. */
export class AppService {
  private projects: ProjectRepo;
  private threads: ThreadRepo;
  private worktrees: WorktreeRepo;
  private kv: KvRepo;
  private automations: AutomationRepo;
  private snoozeTimer: NodeJS.Timeout | null = null;
  private emit: Emit;
  /** Supplies synthetic threads mirrored from remote masters (set by main.ts),
   *  merged into the snapshot so they render in the sidebar tagged as remote. */
  private remoteThreads: () => Thread[] = () => [];

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
  }

  /** Register the provider of remote-master threads (RemoteClientService). */
  setRemoteThreadsProvider(provider: () => Thread[]): void {
    this.remoteThreads = provider;
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
    this.publish();
    return project;
  }

  removeProject(id: string): void {
    this.projects.remove(id);
    this.saveUiState({
      collapsedProjects: this.loadUiState().collapsedProjects.filter((cid) => cid !== id),
    });
    this.publish();
  }

  /** Persist a new sidebar order (full ordered list of project IDs). */
  reorderProjects(orderedIds: string[]): void {
    this.projects.reorder(orderedIds);
    this.publish();
  }

  /** Collapse/expand a project's thread list in the sidebar. */
  setProjectCollapsed(projectId: string, collapsed: boolean): void {
    const collapsedProjects = new Set(this.loadUiState().collapsedProjects);
    if (collapsed) collapsedProjects.add(projectId);
    else collapsedProjects.delete(projectId);
    this.saveUiState({ collapsedProjects: [...collapsedProjects] });
    this.publish();
  }

  /** Persist the sidebar width (clamped to a sane range). */
  setSidebarWidth(width: number): void {
    this.saveUiState({ sidebarWidth: Math.round(Math.min(560, Math.max(200, width))) });
    this.publish();
  }

  /** Persist whether the sidebar is collapsed (hidden, reveal-on-hover). */
  setSidebarCollapsed(collapsed: boolean): void {
    this.saveUiState({ sidebarCollapsed: collapsed });
    this.publish();
  }

  addWorktree(projectId: string, dir: string, name?: string): Worktree {
    const wt = this.worktrees.insert({
      projectId,
      dir,
      name: name ?? this.worktrees.nextName(projectId),
    });
    this.publish();
    return wt;
  }

  worktree(id: string): Worktree | null {
    return this.worktrees.get(id);
  }

  renameWorktree(id: string, name: string): void {
    this.worktrees.setName(id, name);
    this.publish();
  }

  /** Mark a worktree archived; returns its live (non-archived) thread ids so
   *  the caller can archive each thread + remove the git worktree dir. */
  archiveWorktree(id: string): string[] {
    const now = new Date().toISOString();
    this.worktrees.setArchived(id, now);
    const threadIds = this.threads.all()
      .filter((t) => t.worktreeId === id && !t.archivedAt)
      .map((t) => t.id);
    this.publish();
    return threadIds;
  }

  setSelectedThread(threadId: string | null): void {
    this.saveUiState({ selectedThreadId: threadId });
    if (threadId) this.threads.markSeen(threadId);
    this.publish();
  }

  /** Read the HUD's active thread (independent of `selectedThreadId`). */
  getHudThreadId(): string | null {
    return this.loadUiState().hudThreadId;
  }

  /** Point the HUD at a thread. Does NOT touch the Main Window selection. */
  setHudThread(threadId: string | null): void {
    this.saveUiState({ hudThreadId: threadId });
    this.publish();
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
    this.publish();
  }

  snoozeThread(threadId: string, until: string): void {
    this.threads.setSnoozedUntil(threadId, until);
    this.publish();
  }

  unsnoozeThread(threadId: string): void {
    this.threads.setSnoozedUntil(threadId, null);
    this.publish();
  }

  unmarkToTest(threadId: string): void {
    this.threads.setToTest(threadId, null, null);
    this.publish();
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

  getAutoCompact(): AutoCompactSettings {
    return this.kv.get<AutoCompactSettings>(AUTO_COMPACT_KV_KEY) ?? DEFAULT_AUTO_COMPACT;
  }

  setAutoCompact(settings: AutoCompactSettings): AutoCompactSettings {
    this.kv.set(AUTO_COMPACT_KV_KEY, settings);
    return this.getAutoCompact();
  }

  private wakeExpiredSnoozes(): void {
    const woken = this.threads.clearExpiredSnoozes(new Date().toISOString());
    if (woken.length > 0) this.publish();
  }

  private publish(): void {
    this.emit("event:snapshot", this.snapshot());
  }
}
