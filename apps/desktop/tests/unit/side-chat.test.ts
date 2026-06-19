import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../electron/persistence/db.ts";
import { ProjectRepo, ThreadRepo, SideChatRepo } from "../../electron/persistence/repositories.ts";

function memoryDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function seedThread(db: DatabaseSync) {
  const project = new ProjectRepo(db).add("/tmp/repo", "repo", "repo");
  return new ThreadRepo(db).insert({ projectId: project.id, title: "Main" });
}

test("side chat: create, append messages, list newest-first", () => {
  const db = memoryDb();
  const thread = seedThread(db);
  const repo = new SideChatRepo(db);

  const conv = repo.create(thread.id, { provider: "anthropic", id: "claude-haiku-4-5", name: "Haiku" });
  assert.equal(conv.threadId, thread.id);
  assert.deepEqual(conv.messages, []);
  assert.equal(conv.model?.id, "claude-haiku-4-5");

  repo.setMessages(conv.id, [
    { role: "user", text: "what does foo do?" },
    { role: "assistant", text: "it foos." },
  ]);
  repo.setTitle(conv.id, "what does foo do?");

  const loaded = repo.get(conv.id)!;
  assert.equal(loaded.messages.length, 2);
  assert.equal(loaded.messages[1]!.text, "it foos.");
  assert.equal(loaded.title, "what does foo do?");

  // A second conversation should sort ahead (newest first).
  const conv2 = repo.create(thread.id, null);
  const list = repo.listForThread(thread.id);
  assert.equal(list.length, 2);
  assert.equal(list[0]!.id, conv2.id);
  assert.equal(list[0]!.model, null);
});

test("side chat: delete removes one conversation", () => {
  const db = memoryDb();
  const thread = seedThread(db);
  const repo = new SideChatRepo(db);
  const a = repo.create(thread.id, null);
  const b = repo.create(thread.id, null);
  repo.delete(a.id);
  const list = repo.listForThread(thread.id);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, b.id);
});

test("side chat: conversations cascade-delete with their thread", () => {
  const db = memoryDb();
  const thread = seedThread(db);
  const repo = new SideChatRepo(db);
  repo.create(thread.id, null);
  new ThreadRepo(db).delete(thread.id);
  assert.equal(repo.listForThread(thread.id).length, 0);
});
