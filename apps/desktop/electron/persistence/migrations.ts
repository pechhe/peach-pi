import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  up: (db: DatabaseSync) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('repo','folder')),
          ord INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          archived_at TEXT
        );

        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          pi_session_file TEXT,
          chat_workspace_dir TEXT,
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'idle',
          snoozed_until TEXT,
          to_test_at TEXT,
          to_test_note TEXT,
          archived_at TEXT,
          created_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL
        );
        CREATE INDEX idx_threads_project ON threads(project_id);

        -- Single-row JSON blobs (ui state, composer layout, model settings…)
        CREATE TABLE kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE automations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          cron TEXT NOT NULL,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          prompt TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_fired_at TEXT,
          next_fire_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE automation_runs (
          id TEXT PRIMARY KEY,
          automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
          thread_id TEXT,
          fired_at TEXT NOT NULL
        );
        CREATE INDEX idx_automation_runs ON automation_runs(automation_id, fired_at DESC);
      `);
    },
  },
  {
    version: 3,
    up: (db) => {
      // Worktree threads: isolated git worktree per thread (detached HEAD,
      // lazy branch on first commit — ADR-0003 model from peche-pi).
      db.exec("ALTER TABLE threads ADD COLUMN worktree_dir TEXT");
    },
  },
];
