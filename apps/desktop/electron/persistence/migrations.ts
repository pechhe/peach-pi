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
];
