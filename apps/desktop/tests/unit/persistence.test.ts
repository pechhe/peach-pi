import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, migrate } from "../../electron/persistence/db.ts";
import { ProjectRepo, ThreadRepo, KvRepo } from "../../electron/persistence/repositories.ts";
import { DatabaseSync } from "node:sqlite";

function memoryDb() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("migrations are idempotent", () => {
  const db = memoryDb();
  migrate(db); // second run = no-op
  const v = db.prepare("PRAGMA user_version").get() as { user_version: number };
  assert.equal(v.user_version, 1);
});

test("project add/list/remove round-trip", () => {
  const repo = new ProjectRepo(memoryDb());
  const p = repo.add("/tmp/demo", "demo", "folder");
  assert.equal(repo.all().length, 1);
  assert.equal(repo.all()[0]!.name, "demo");
  repo.remove(p.id);
  assert.equal(repo.all().length, 0);
});

test("expired snoozes auto-clear and are returned", () => {
  const db = memoryDb();
  const threads = new ThreadRepo(db);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO threads (id, title, created_at, last_activity_at, snoozed_until) VALUES ('t1','x',?,?,?)",
  ).run(now, now, "2000-01-01T00:00:00.000Z");
  db.prepare(
    "INSERT INTO threads (id, title, created_at, last_activity_at, snoozed_until) VALUES ('t2','y',?,?,?)",
  ).run(now, now, "2999-01-01T00:00:00.000Z");

  const woken = threads.clearExpiredSnoozes(now);
  assert.equal(woken.length, 1);
  assert.equal(woken[0]!.id, "t1");
  assert.equal(threads.get("t1")!.snoozedUntil, undefined);
  assert.equal(threads.get("t2")!.snoozedUntil, "2999-01-01T00:00:00.000Z");
});

test("kv json round-trip", () => {
  const kv = new KvRepo(memoryDb());
  kv.set("ui", { sidebarWidth: 300 });
  assert.deepEqual(kv.get("ui"), { sidebarWidth: 300 });
  kv.set("ui", { sidebarWidth: 200 });
  assert.deepEqual(kv.get("ui"), { sidebarWidth: 200 });
});

test("openDb creates file-backed db with WAL", (t) => {
  const path = `/tmp/peach-pi-test-${Date.now()}.sqlite`;
  const db = openDb(path);
  t.after(() => db.close());
  const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  assert.equal(mode.journal_mode, "wal");
});
