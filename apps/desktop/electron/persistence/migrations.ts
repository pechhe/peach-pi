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
  {
    version: 4,
    up: (db) => {
      // Auto-classified category, set alongside the auto-generated title.
      db.exec("ALTER TABLE threads ADD COLUMN tag TEXT");
    },
  },
  {
    version: 5,
    up: (db) => {
      // `/btw` side conversations: cheap, isolated mini-chats attached to a
      // thread. They read the main conversation as context but never write to
      // it. Persisted so prior side chats form a browsable history.
      db.exec(`
        CREATE TABLE side_conversations (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT '',
          model_provider TEXT,
          model_id TEXT,
          model_name TEXT,
          messages TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_side_conversations_thread
          ON side_conversations(thread_id, created_at DESC);
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      // Timestamp set when a snooze timer expires and the thread auto-returns
      // to active. Drives the "woke from snooze" highlight; cleared on open.
      db.exec("ALTER TABLE threads ADD COLUMN woke_from_snooze_at TEXT");
    },
  },
  {
    version: 7,
    up: (db) => {
      // Saved external-service connectors (BYO OAuth client / API keys).
      // `config_json` = non-secret OAuth config; `secret_blob` = safeStorage-
      // encrypted JSON (api key, or OAuth token set + client secret). Secrets
      // never leave the main process — the renderer sees only `Connector`.
      db.exec(`
        CREATE TABLE connectors (
          id            TEXT PRIMARY KEY,
          provider      TEXT NOT NULL,
          label         TEXT NOT NULL,
          auth_kind     TEXT NOT NULL CHECK (auth_kind IN ('api_key','oauth')),
          config_json   TEXT NOT NULL DEFAULT '{}',
          secret_blob   BLOB,
          expires_at    TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
        CREATE INDEX idx_connectors_provider ON connectors(provider);
      `);
    },
  },
  {
    version: 8,
    up: (db) => {
      // Worktrees become first-class registry rows (ADR-0003 evolved):
      //  - `worktrees` holds one row per isolated git worktree a project owns.
      //  - `threads.worktree_id` references it; null = the project's main
      //    checkout ("master/local"). Many threads can share one worktree.
      //  - Backfill: every distinct non-null `worktree_dir` becomes a row,
      //    and every thread with that dir picks up the new id. `worktree_dir`
      //    stays as a denormalized cache of `worktrees.dir` for git-service.
      db.exec(`
        CREATE TABLE worktrees (
          id          TEXT PRIMARY KEY,
          project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          dir         TEXT NOT NULL,
          name        TEXT NOT NULL DEFAULT 'Worktree',
          created_at  TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE INDEX idx_worktrees_project ON worktrees(project_id);
        ALTER TABLE threads ADD COLUMN worktree_id TEXT REFERENCES worktrees(id) ON DELETE SET NULL;
        CREATE INDEX idx_threads_worktree ON threads(worktree_id);
      `);
      // Backfill one worktree row per distinct dir already in use.
      const dirs = db
        .prepare("SELECT DISTINCT worktree_dir FROM threads WHERE worktree_dir IS NOT NULL")
        .all() as { worktree_dir: string }[];
      const insertWt = db.prepare(
        "INSERT INTO worktrees (id, project_id, dir, name, created_at) VALUES (?,?,?,?,?)",
      );
      const linkThread = db.prepare("UPDATE threads SET worktree_id = ? WHERE worktree_dir = ?");
      const now = new Date().toISOString();
      let n = 1;
      for (const { worktree_dir } of dirs) {
        // Deterministic id from the dir path so re-running is idempotent.
        const dirBasename = worktree_dir.split(/[\\/]/).pop() || "wt";
        const id = `wt-${dirBasename}`;
        // Recover the owning project from any thread that uses this dir.
        const row = db
          .prepare(
            "SELECT project_id FROM threads WHERE worktree_dir = ? AND project_id IS NOT NULL LIMIT 1",
          )
          .get(worktree_dir) as { project_id: string } | undefined;
        if (!row) continue;
        insertWt.run(id, row.project_id, worktree_dir, `Worktree ${n}`, now);
        linkThread.run(id, worktree_dir);
        n++;
      }
    },
  },
  {
    version: 9,
    up: (db) => {
      // Automations can now fire into a fresh isolated worktree instead of the
      // project's main checkout. Existing rows default to 'local'.
      db.exec(
        "ALTER TABLE automations ADD COLUMN environment TEXT NOT NULL DEFAULT 'local'",
      );
    },
  },
];
