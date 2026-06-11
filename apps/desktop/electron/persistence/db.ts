import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.ts";

/**
 * App database. Uses node:sqlite (ships with Electron's Node — no native
 * rebuild needed, testable in plain node). Wrapped so a swap to
 * better-sqlite3 stays local to this file.
 */
export type AppDb = DatabaseSync;

export function openDb(path: string): AppDb {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function migrate(db: AppDb): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  for (const migration of migrations) {
    if (migration.version <= version) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
      version = migration.version;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
