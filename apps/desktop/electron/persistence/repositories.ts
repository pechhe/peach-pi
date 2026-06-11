import { randomUUID } from "node:crypto";
import type { Project, Thread, UiState } from "@peach-pi/shared-types";
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
  title: string;
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
  title: r.title,
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
};
