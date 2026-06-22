import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, migrate } from "../../electron/persistence/db.ts";
import { AutomationRepo, ProjectRepo, ThreadRepo, WorktreeRepo, KvRepo } from "../../electron/persistence/repositories.ts";
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
  assert.equal(v.user_version, 8);
});

test("automation lifecycle: insert, due, fire, runs, disable", () => {
  const db = memoryDb();
  const repo = new AutomationRepo(db);
  const auto = repo.insert({
    name: "Morning",
    cron: "0 9 * * *",
    projectId: null,
    prompt: "do the thing",
    nextFireAt: "2026-01-01T09:00:00.000Z",
  });
  assert.equal(auto.enabled, true);
  assert.equal(repo.due("2026-01-01T08:59:00.000Z").length, 0);
  assert.equal(repo.due("2026-01-01T09:00:00.000Z").length, 1);

  repo.markFired(auto.id, "2026-01-01T09:00:01.000Z", "2026-01-02T09:00:00.000Z");
  assert.equal(repo.due("2026-01-01T10:00:00.000Z").length, 0);
  assert.equal(repo.get(auto.id)!.lastFiredAt, "2026-01-01T09:00:01.000Z");

  repo.recordRun(auto.id, "thread-1", "2026-01-01T09:00:01.000Z");
  assert.equal(repo.runs(auto.id).length, 1);
  assert.equal(repo.runs(auto.id)[0]!.threadId, "thread-1");

  repo.setEnabled(auto.id, false, null);
  assert.equal(repo.due("2026-01-03T10:00:00.000Z").length, 0);

  repo.delete(auto.id);
  assert.equal(repo.all().length, 0);
});

test("project add/list/remove round-trip", () => {
  const repo = new ProjectRepo(memoryDb());
  const p = repo.add("/tmp/demo", "demo", "folder");
  assert.equal(repo.all().length, 1);
  assert.equal(repo.all()[0]!.name, "demo");
  repo.remove(p.id);
  assert.equal(repo.all().length, 0);
});

test("project reorder persists ord and resorts all()", () => {
  const repo = new ProjectRepo(memoryDb());
  const a = repo.add("/tmp/a", "a", "folder");
  const b = repo.add("/tmp/b", "b", "folder");
  const c = repo.add("/tmp/c", "c", "folder");
  assert.deepEqual(repo.all().map((p) => p.name), ["a", "b", "c"]);

  // Move c to the front.
  repo.reorder([c.id, a.id, b.id]);
  assert.deepEqual(repo.all().map((p) => p.name), ["c", "a", "b"]);
  assert.deepEqual(repo.all().map((p) => p.order), [0, 1, 2]);
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
  // Woken thread is tagged so the UI can highlight it; opening clears the tag.
  assert.equal(woken[0]!.wokeFromSnoozeAt, now);
  assert.equal(threads.get("t1")!.wokeFromSnoozeAt, now);
  threads.markSeen("t1");
  assert.equal(threads.get("t1")!.wokeFromSnoozeAt, undefined);
});

test("kv json round-trip", () => {
  const kv = new KvRepo(memoryDb());
  kv.set("ui", { sidebarWidth: 300 });
  assert.deepEqual(kv.get("ui"), { sidebarWidth: 300 });
  kv.set("ui", { sidebarWidth: 200 });
  assert.deepEqual(kv.get("ui"), { sidebarWidth: 200 });
});

test("worktree repo: insert, nextName, active for project, archive", () => {
  const db = memoryDb();
  const projects = new ProjectRepo(db);
  const threads = new ThreadRepo(db);
  const repo = new WorktreeRepo(db);
  const p = projects.add("/tmp/proj", "proj", "repo");

  const w1 = repo.insert({ projectId: p.id, dir: "/tmp/proj/.wt/1", name: repo.nextName(p.id) });
  assert.equal(w1.name, "Worktree 1");
  const w2 = repo.insert({ projectId: p.id, dir: "/tmp/proj/.wt/2", name: repo.nextName(p.id) });
  assert.equal(w2.name, "Worktree 2");

  // Threads link via worktree id, and the repo reports active worktrees.
  threads.insert({ projectId: p.id, title: "t1", worktreeId: w1.id, worktreeDir: w1.dir });
  threads.insert({ projectId: p.id, title: "t2", worktreeId: w1.id, worktreeDir: w1.dir });
  assert.equal(repo.activeForProject(p.id).length, 2);

  // Archiving a worktree removes it from the active list but keeps the row.
  repo.setArchived(w1.id, new Date().toISOString());
  assert.equal(repo.activeForProject(p.id).length, 1);
  assert.equal(repo.get(w1.id)!.archivedAt != null, true);
});

test("openDb creates file-backed db with WAL", (t) => {
  const path = `/tmp/peach-pi-test-${Date.now()}.sqlite`;
  const db = openDb(path);
  t.after(() => db.close());
  const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  assert.equal(mode.journal_mode, "wal");
});
