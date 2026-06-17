import { randomUUID } from "node:crypto";
import type { Automation, AutomationRun, Project, Thread, ThreadTag, UiState } from "@peach-pi/shared-types";
import type { AppDb } from "./db.ts";

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  kind: string;
  ord: number;
  created_at: string;
  archived_at: string | null;
}

interface ThreadRow {
  id: string;
  project_id: string | null;
  pi_session_file: string | null;
  chat_workspace_dir: string | null;
  worktree_dir: string | null;
  title: string;
  tag: string | null;
  status: string;
  snoozed_until: string | null;
  to_test_at: string | null;
  to_test_note: string | null;
  archived_at: string | null;
  created_at: string;
  last_activity_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  path: r.path,
  name: r.name,
  kind: r.kind as Project["kind"],
  order: r.ord,
  createdAt: r.created_at,
  archivedAt: r.archived_at ?? undefined,
});

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  projectId: r.project_id,
  piSessionFile: r.pi_session_file,
  chatWorkspaceDir: r.chat_workspace_dir ?? undefined,
  worktreeDir: r.worktree_dir ?? undefined,
  title: r.title,
  tag: (r.tag as ThreadTag | null) ?? undefined,
  status: r.status as Thread["status"],
  snoozedUntil: r.snoozed_until ?? undefined,
  toTestAt: r.to_test_at ?? undefined,
  toTestNote: r.to_test_note ?? undefined,
  archivedAt: r.archived_at ?? undefined,
  createdAt: r.created_at,
  lastActivityAt: r.last_activity_at,
});

export class ProjectRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY ord, created_at")
      .all() as unknown as ProjectRow[];
    return rows.map(toProject);
  }

  add(path: string, name: string, kind: Project["kind"]): Project {
    const id = randomUUID();
    const now = new Date().toISOString();
    const maxOrd = (
      this.db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM projects").get() as { m: number }
    ).m;
    this.db
      .prepare("INSERT INTO projects (id, path, name, kind, ord, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, path, name, kind, maxOrd + 1, now);
    return { id, path, name, kind, order: maxOrd + 1, createdAt: now };
  }

  remove(id: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  /** Persist a full reordering. Writes the `ord` of each listed project to
   *  its array index; projects not in the list keep their old ord. */
  reorder(orderedIds: string[]): void {
    const stmt = this.db.prepare("UPDATE projects SET ord = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      orderedIds.forEach((id, index) => stmt.run(index, id));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

export class ThreadRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Thread[] {
    const rows = this.db
      .prepare("SELECT * FROM threads ORDER BY last_activity_at DESC")
      .all() as unknown as ThreadRow[];
    return rows.map(toThread);
  }

  insert(fields: {
    projectId: string | null;
    title: string;
    piSessionFile?: string;
    chatWorkspaceDir?: string;
    worktreeDir?: string;
  }): Thread {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO threads (id, project_id, pi_session_file, chat_workspace_dir, worktree_dir, title, status, created_at, last_activity_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        fields.projectId,
        fields.piSessionFile ?? null,
        fields.chatWorkspaceDir ?? null,
        fields.worktreeDir ?? null,
        fields.title,
        "idle",
        now,
        now,
      );
    return this.get(id)!;
  }

  setArchived(id: string, at: string | null): void {
    this.db.prepare("UPDATE threads SET archived_at = ? WHERE id = ?").run(at, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
  }

  setStatus(id: string, status: Thread["status"]): void {
    this.db
      .prepare("UPDATE threads SET status = ?, last_activity_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  /** Clear the "finished, unseen" accent when a thread is opened. Leaves
   *  last_activity_at untouched so opening doesn't reorder the list. */
  markSeen(id: string): void {
    this.db
      .prepare("UPDATE threads SET status = 'idle' WHERE id = ? AND status = 'completed'")
      .run(id);
  }

  setTitle(id: string, title: string): void {
    this.db.prepare("UPDATE threads SET title = ? WHERE id = ?").run(title, id);
  }

  setTag(id: string, tag: ThreadTag): void {
    this.db.prepare("UPDATE threads SET tag = ? WHERE id = ?").run(tag, id);
  }

  setSessionFile(id: string, file: string): void {
    this.db.prepare("UPDATE threads SET pi_session_file = ? WHERE id = ?").run(file, id);
  }

  get(id: string): Thread | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as
      | ThreadRow
      | undefined;
    return row ? toThread(row) : null;
  }

  setSnoozedUntil(id: string, until: string | null): void {
    this.db.prepare("UPDATE threads SET snoozed_until = ? WHERE id = ?").run(until, id);
  }

  setToTest(id: string, at: string | null, note: string | null): void {
    this.db.prepare("UPDATE threads SET to_test_at = ?, to_test_note = ? WHERE id = ?").run(at, note, id);
  }

  /** Threads whose snooze expired — auto-return to active (decision #5). */
  clearExpiredSnoozes(now: string): Thread[] {
    const rows = this.db
      .prepare("SELECT * FROM threads WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?")
      .all(now) as unknown as ThreadRow[];
    this.db
      .prepare("UPDATE threads SET snoozed_until = NULL WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?")
      .run(now);
    return rows.map((r) => toThread({ ...r, snoozed_until: null }));
  }
}

interface AutomationRow {
  id: string;
  name: string;
  cron: string;
  project_id: string | null;
  prompt: string;
  enabled: number;
  last_fired_at: string | null;
  next_fire_at: string | null;
  created_at: string;
}

const toAutomation = (r: AutomationRow): Automation => ({
  id: r.id,
  name: r.name,
  cron: r.cron,
  projectId: r.project_id,
  prompt: r.prompt,
  enabled: r.enabled === 1,
  lastFiredAt: r.last_fired_at ?? undefined,
  nextFireAt: r.next_fire_at ?? undefined,
  createdAt: r.created_at,
});

export class AutomationRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Automation[] {
    const rows = this.db
      .prepare("SELECT * FROM automations ORDER BY created_at")
      .all() as unknown as AutomationRow[];
    return rows.map(toAutomation);
  }

  get(id: string): Automation | null {
    const row = this.db.prepare("SELECT * FROM automations WHERE id = ?").get(id) as
      | AutomationRow
      | undefined;
    return row ? toAutomation(row) : null;
  }

  insert(fields: {
    name: string;
    cron: string;
    projectId: string | null;
    prompt: string;
    nextFireAt: string | null;
  }): Automation {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO automations (id, name, cron, project_id, prompt, enabled, next_fire_at, created_at) VALUES (?,?,?,?,?,1,?,?)",
      )
      .run(id, fields.name, fields.cron, fields.projectId, fields.prompt, fields.nextFireAt, now);
    return this.get(id)!;
  }

  setEnabled(id: string, enabled: boolean, nextFireAt: string | null): void {
    this.db
      .prepare("UPDATE automations SET enabled = ?, next_fire_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, nextFireAt, id);
  }

  markFired(id: string, firedAt: string, nextFireAt: string | null): void {
    this.db
      .prepare("UPDATE automations SET last_fired_at = ?, next_fire_at = ? WHERE id = ?")
      .run(firedAt, nextFireAt, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM automations WHERE id = ?").run(id);
  }

  due(nowIso: string): Automation[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM automations WHERE enabled = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= ?",
      )
      .all(nowIso) as unknown as AutomationRow[];
    return rows.map(toAutomation);
  }

  recordRun(automationId: string, threadId: string | null, firedAt: string): void {
    this.db
      .prepare("INSERT INTO automation_runs (id, automation_id, thread_id, fired_at) VALUES (?,?,?,?)")
      .run(randomUUID(), automationId, threadId, firedAt);
  }

  runs(automationId: string, limit = 20): AutomationRun[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY fired_at DESC LIMIT ?",
      )
      .all(automationId, limit) as unknown as Array<{
      id: string;
      automation_id: string;
      thread_id: string | null;
      fired_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      automationId: r.automation_id,
      threadId: r.thread_id,
      firedAt: r.fired_at,
    }));
  }
}

export class KvRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
}

export const defaultUiState: UiState = {
  sidebarWidth: 280,
  sidebarCollapsed: false,
  activeView: "new-thread",
  selectedThreadId: null,
  collapsedProjects: [],
};

/** KV key for the configured "utility" model (background LLM tasks: titles/commits). */
export const UTILITY_MODEL_KV_KEY = "utility-model";

/** KV key for the auto-compaction thresholds. */
export const AUTO_COMPACT_KV_KEY = "auto-compact";
