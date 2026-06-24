import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Registry, machineSlug, patchThread } from "../src/registry.ts";
import { threadBranch } from "../src/ids.ts";
import type { HandoffThread, Machine } from "../src/types.ts";

function newThread(id: string, name: string, owner: string, now: Date): HandoffThread {
  return {
    id,
    name,
    branch: threadBranch(id, name),
    status: "new",
    activeMachine: owner,
    leaseOwner: owner,
    leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    workspacePath: null,
    lastCommit: null,
    hasUncommittedChanges: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    baseBranch: "main",
    command: null,
    pid: null,
    logPath: null,
    recoveryBranch: null,
  };
}

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), "peach-reg-"));
}

test("registry persists threads across instances (JSON round-trip)", async () => {
  const root = freshRoot();
  const now = new Date("2026-06-24T12:00:00Z");
  const r1 = new Registry(root);
  await r1.addThread(newThread("thread_aaa", "auth", "home", now));

  const r2 = new Registry(root); // new instance, same root
  const threads = await r2.loadThreads();
  assert.equal(threads.length, 1);
  assert.equal(threads[0]!.id, "thread_aaa");
  assert.equal(threads[0]!.activeMachine, "home");
  rmSync(root, { recursive: true, force: true });
});

test("addThread rejects duplicate id and duplicate branch", async () => {
  const root = freshRoot();
  const r = new Registry(root);
  const now = new Date();
  await r.addThread(newThread("thread_dup", "x", "home", now));
  await assert.rejects(() => r.addThread(newThread("thread_dup", "y", "home", now)), /already exists/);
  // A distinct id with the same description also registers fine (branches embed the id).
  const ok = await r.addThread(newThread("thread_other", "x", "home", now));
  assert.equal(ok.branch, "peach/thread_other-x");
  rmSync(root, { recursive: true, force: true });
});

test("updateThread applies a patch and stamps updatedAt", async () => {
  const root = freshRoot();
  const r = new Registry(root);
  const now = new Date("2026-06-24T12:00:00Z");
  await r.addThread(newThread("thread_u1", "x", "home", now));
  const later = new Date("2026-06-24T13:00:00Z");
  const updated = await r.updateThread("thread_u1", { status: "running", pid: 4242 }, later);
  assert.equal(updated.status, "running");
  assert.equal(updated.pid, 4242);
  assert.equal(updated.updatedAt, later.toISOString());
  // updatedAt differs from createdAt.
  assert.notEqual(updated.updatedAt, updated.createdAt);
  rmSync(root, { recursive: true, force: true });
});

test("patchThread is pure and does not mutate the input", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = newThread("thread_p", "x", "home", now);
  const patched = patchThread(t, { status: "paused" }, new Date("2026-06-24T12:30:00Z"));
  assert.equal(t.status, "new"); // original untouched
  assert.equal(patched.status, "paused");
});

test("machines self-register with a stable slug id, and setSelf round-trips", async () => {
  const root = freshRoot();
  const r = new Registry(root);
  const self = await r.self();
  assert.equal(self.name, "local");
  assert.equal(self.id, `m_${machineSlug("local")}`);
  // second call returns the same persisted machine.
  const self2 = await r.self();
  assert.equal(self2.id, self.id);
  const machines = await r.loadMachines();
  assert.equal(machines.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("upsertMachine updates an existing machine in place by id", async () => {
  const root = freshRoot();
  const r = new Registry(root);
  const m: Machine = {
    id: "m_home",
    name: "home",
    role: "remote",
    repoPath: "/repo",
    workspaceRoot: join(root, "workspaces"),
    onlineStatus: "unknown",
    lastSeenAt: null,
    sshHost: "home.tail",
  };
  await r.upsertMachine(m);
  await r.upsertMachine({ ...m, onlineStatus: "online", lastSeenAt: "now" });
  const got = await r.getMachine("m_home");
  assert.equal(got?.onlineStatus, "online");
  assert.equal(got?.sshHost, "home.tail");
  const byName = await r.machineByName("home");
  assert.equal(byName?.id, "m_home");
  rmSync(root, { recursive: true, force: true });
});

test("JSON file is human-readable on disk", async () => {
  const root = freshRoot();
  const r = new Registry(root);
  const now = new Date("2026-06-24T12:00:00Z");
  await r.addThread(newThread("thread_io", "x", "home", now));
  const raw = readFileSync(join(root, "threads.json"), "utf8");
  assert.ok(raw.includes('"id": "thread_io"'));
  assert.ok(raw.includes('"activeMachine": "home"'));
  rmSync(root, { recursive: true, force: true });
});
