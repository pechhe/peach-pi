import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireLease, canMutate, canTake, isExpired, leaseHolder, releaseLease } from "../src/lease.ts";
import { threadBranch } from "../src/ids.ts";
import type { HandoffThread } from "../src/types.ts";

function thread(leaseOwner: string, expiresAt: string | null, now: Date): HandoffThread {
  return {
    id: "thread_abc",
    name: "x",
    branch: threadBranch("thread_abc", "x"),
    status: "running",
    activeMachine: leaseOwner,
    leaseOwner,
    leaseExpiresAt: expiresAt,
    workspacePath: null,
    lastCommit: null,
    hasUncommittedChanges: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    baseBranch: "main",
    command: null,
    pid: 1,
    logPath: null,
    recoveryBranch: null,
  };
}

test("isExpired is true for null expiry and for past expiry", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  assert.equal(isExpired(thread("home", null, now), now), true);
  assert.equal(isExpired(thread("home", "2026-06-24T11:00:00Z", now), now), true);
  assert.equal(isExpired(thread("home", "2026-06-24T13:00:00Z", now), now), false);
});

test("leaseHolder returns owner only while the lease is live", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  assert.equal(leaseHolder(thread("home", "2026-06-24T13:00:00Z", now), now), "home");
  assert.equal(leaseHolder(thread("home", null, now), now), null);
});

test("canTake is blocked when another machine holds a live lease", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T13:00:00Z", now); // home holds a live lease
  const decision = canTake(t, "local", now, false);
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.blocked, true);
    assert.equal(decision.owner, "home");
  }
});

test("canTake with --force overrides a live lease on another machine", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T13:00:00Z", now);
  const decision = canTake(t, "local", now, true);
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.kind, "force");
});

test("canTake without force succeeds when the lease has lapsed", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T11:00:00Z", now); // lapsed
  const decision = canTake(t, "local", now, false);
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.kind, "lapsed");
});

test("canTake is already-owner when this machine holds a live lease", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("local", "2026-06-24T13:00:00Z", now);
  const decision = canTake(t, "local", now, false);
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.kind, "already-owner");
});

test("canMutate is true only for the live lease holder", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T13:00:00Z", now);
  assert.equal(canMutate(t, "home", now), true);
  assert.equal(canMutate(t, "local", now), false); // not the owner
});

test("canMutate is false for everyone once the lease lapses", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T11:00:00Z", now);
  assert.equal(canMutate(t, "home", now), false);
  assert.equal(canMutate(t, "local", now), false);
});

test("acquireLease sets owner, holder and a future expiry", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("home", "2026-06-24T11:00:00Z", now); // lapsed lease on home
  const acquired = acquireLease(t, "local", 30, now);
  assert.equal(acquired.activeMachine, "local");
  assert.equal(acquired.leaseOwner, "local");
  assert.equal(new Date(acquired.leaseExpiresAt!).getTime(), now.getTime() + 30 * 60_000);
  // Original untouched.
  assert.equal(t.leaseOwner, "home");
});

test("releaseLease clears expiry and pauses a running thread", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const t = thread("local", "2026-06-24T13:00:00Z", now);
  const released = releaseLease(t, now);
  assert.equal(released.leaseExpiresAt, null);
  assert.equal(released.status, "paused");
  assert.equal(released.pid, null);
});
