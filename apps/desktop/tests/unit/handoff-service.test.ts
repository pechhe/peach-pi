import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../electron/persistence/db.ts";
import { createHandoffService } from "../../electron/services/movable-execution/handoff-service.ts";

/** Make an isolated HandoffAppService backed by an in-memory DB + a temp
 *  PEACH_ROOT so tests never touch real ~/.peach state. */
function makeService() {
  const db = openDb(":memory:");
  const root = mkdtempSync(join(tmpdir(), "peach-handoff-"));
  const noEmit = (() => void 0) as unknown as Parameters<typeof createHandoffService>[1];
  const svc = createHandoffService(db, noEmit, root);
  return { svc };
}

test("getMode: defaults to off with no remote machine", async () => {
  const { svc } = makeService();
  const mode = await svc.getMode();
  assert.equal(mode.enabled, false);
  assert.equal(mode.targetMachine, null);
  assert.equal(mode.hasRemoteMachine, false);
});

test("setMode: persists the on/off flag", async () => {
  const { svc } = makeService();
  const on = await svc.setMode(true);
  assert.equal(on.enabled, true);
  const off = await svc.setMode(false);
  assert.equal(off.enabled, false);
});

test("statusForThread: a thread never handed off is owner 'none'", async () => {
  const { svc } = makeService();
  const status = await svc.statusForThread("thread_abc");
  assert.equal(status.owner, "none");
  assert.equal(status.handoffThreadId, null);
  assert.equal(status.remoteMachine, null);
  assert.equal(status.leaseHeldHere, false);
});

test("statusForThread is inert when remote-first is off", async () => {
  const { svc } = makeService();
  const after = await svc.ensureRemoteForThread("thread_xyz", "do a thing");
  // No remote machine registered → no handoff attempted; thread stays "none".
  assert.equal(after.owner, "none");
});

test("registerMachine: seeds target + marks a remote machine available", async () => {
  const { svc } = makeService();
  await svc.registerMachine({ name: "home-laptop", sshHost: "home", repoPath: "/srv/repo" });
  const mode = await svc.getMode();
  assert.equal(mode.hasRemoteMachine, true);
  assert.equal(mode.targetMachine, "home-laptop");
});
