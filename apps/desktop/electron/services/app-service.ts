import { basename } from "node:path";
import { existsSync } from "node:fs";
import type {
  AppSnapshot,
  AutoCompactSettings,
  ModelInfo,
  Project,
  UiState,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import {
  AUTO_COMPACT_KV_KEY,
  AutomationRepo,
  UTILITY_MODEL_KV_KEY,
  defaultUiState,
  KvRepo,
  ProjectRepo,
  ThreadRepo,
} from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

const UI_STATE_KEY = "ui-state";

/** Default auto-compaction thresholds (matches the historical 80% behaviour). */
const DEFAULT_AUTO_COMPACT: AutoCompactSettings = { percent: 80, tokens: null };

/** Owns app state; publishes snapshots after every mutation. */
export class AppService {
  private projects: ProjectRepo;
  private threads: ThreadRepo;
  private kv: KvRepo;
  private automations: AutomationRepo;
  private snoozeTimer: NodeJS.Timeout | null = null;
  private emit: Emit;

  constructor(db: AppDb, emit: Emit) {
    this.emit = emit;
    this.projects = new ProjectRepo(db);
    this.threads = new ThreadRepo(db);
    this.kv = new KvRepo(db);
    this.automations = new AutomationRepo(db);
  }

  start(): void {
    // Auto-return snoozed threads to active (60s poll, utility).
    this.snoozeTimer = setInterval(() => this.wakeExpiredSnoozes(), 60_000);
    this.wakeExpiredSnoozes();
  }

  stop(): void {
    if (this.snoozeTimer) clearInterval(this.snoozeTimer);
  }

  snapshot(): AppSnapshot {
    return {
      projects: this.projects.all(),
      threads: this.threads.all(),
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

  setSelectedThread(threadId: string | null): void {
    this.saveUiState({ selectedThreadId: threadId });
    if (threadId) this.threads.markSeen(threadId);
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

  markToTest(threadId: string, note?: string): void {
    this.threads.setToTest(threadId, new Date().toISOString(), note ?? null);
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
