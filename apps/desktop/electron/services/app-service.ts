import { basename } from "node:path";
import { existsSync } from "node:fs";
import type { AppSnapshot, Project, UiState } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { defaultUiState, KvRepo, ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

const UI_STATE_KEY = "ui-state";

/** Owns app state; publishes snapshots after every mutation. */
export class AppService {
  private projects: ProjectRepo;
  private threads: ThreadRepo;
  private kv: KvRepo;
  private snoozeTimer: NodeJS.Timeout | null = null;
  private emit: Emit;

  constructor(db: AppDb, emit: Emit) {
    this.emit = emit;
    this.projects = new ProjectRepo(db);
    this.threads = new ThreadRepo(db);
    this.kv = new KvRepo(db);
  }

  start(): void {
    // Auto-return snoozed threads to active (60s poll, cheap).
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
      ui: this.kv.get<UiState>(UI_STATE_KEY) ?? defaultUiState,
    };
  }

  addProject(path: string): Project {
    const kind = existsSync(`${path}/.git`) ? "repo" : "folder";
    const project = this.projects.add(path, basename(path), kind);
    this.publish();
    return project;
  }

  removeProject(id: string): void {
    this.projects.remove(id);
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

  private wakeExpiredSnoozes(): void {
    const woken = this.threads.clearExpiredSnoozes(new Date().toISOString());
    if (woken.length > 0) this.publish();
  }

  private publish(): void {
    this.emit("event:snapshot", this.snapshot());
  }
}
