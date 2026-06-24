import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append } from "./git-harness.ts";
import { FakeTransport, type DaemonHandlers } from "./fake-transport.ts";
import { HandoffService } from "../src/handoff.ts";
import { logPath } from "../src/logs.ts";
import { ensureWorktree, pushBranch } from "../src/git.ts";
import { threadBranch } from "../src/ids.ts";
import type { HandoffThread } from "../src/types.ts";
import { setupHarness, teardown, type Harness } from "./git-harness.ts";

const NOW = () => new Date("2026-06-24T14:30:00Z");
const LEASE_MIN = 60 * 24;

/** A thread owned by `m_<owner>` with a live lease, with its worktree created on
 *  the owner's clone and the branch pushed to origin (so a peer can fetch it). */
async function seedThread(
  ownerName: string,
  h: Harness,
  rootOwner: string,
  owner: HandoffService,
  id: string,
  task: string,
  now: Date,
): Promise<HandoffThread> {
  const branch = threadBranch(id, task);
  const self = await owner.self();
  const worktreeDir = join(self.workspaceRoot, id);
  await ensureWorktree(h.home, worktreeDir, branch, "main");
  await pushBranch(worktreeDir, branch);
  const thread: HandoffThread = {
    id,
    name: task,
    branch,
    status: "running",
    activeMachine: `m_${ownerName}`,
    leaseOwner: `m_${ownerName}`,
    leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    workspacePath: worktreeDir,
    lastCommit: null,
    hasUncommittedChanges: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    baseBranch: "main",
    command: "echo peach-worker",
    pid: 4321,
    logPath: logPath(rootOwner, id),
    recoveryBranch: null,
  };
  await owner.getRegistry().addThread(thread);
  return thread;
}

interface Env {
  h: Harness;
  homeRoot: string;
  localRoot: string;
  home: HandoffService;
  local: HandoffService;
  homeT: FakeTransport;
  localT: FakeTransport;
}

async function env(): Promise<Env> {
  const h = await setupHarness();
  const homeRoot = mkdtempSync(join(tmpdir(), "peach-home-"));
  const localRoot = mkdtempSync(join(tmpdir(), "peach-local-"));

  const homeT = new FakeTransport();
  const localT = new FakeTransport();

  const home = new HandoffService({
    root: homeRoot,
    repoPath: h.home,
    machineName: "home",
    transport: homeT,
    now: NOW,
    leaseMinutes: LEASE_MIN,
    command: "echo peach-worker",
  });
  const local = new HandoffService({
    root: localRoot,
    repoPath: h.local,
    machineName: "local",
    transport: localT,
    now: NOW,
    leaseMinutes: LEASE_MIN,
    command: "echo peach-worker",
  });

  // Wire the transports: each service's outbound routes to the peer's daemon.
  localT.peerHandlers = daemonHandlers(home);
  homeT.peerHandlers = daemonHandlers(local);

  // Seed each registry with both machine records so the controller can resolve
  // the peer it needs to pause/checkpoint. (In real usage, `peach machine add`
  // does this; self() self-registers the local one.)
  await home.addMachine({ name: "local", sshHost: "local" });
  await local.addMachine({ name: "home", sshHost: "home" });
  await local.addMachine({ name: "local", sshHost: "local" });
  await home.addMachine({ name: "home", sshHost: "home" });

  return { h, homeRoot, localRoot, home, local, homeT, localT };
}

function daemonHandlers(s: HandoffService): DaemonHandlers {
  return {
    ping: async () => (await s.daemonPing()) === "pong",
    status: (id) => s.daemonStatus(id),
    pause: (id) => s.daemonPause(id),
    start: (id) => s.daemonStart(id),
    checkpoint: (id) => s.daemonCheckpoint(id),
    ensureWorktree: (id) => s.daemonWorktree(id),
    logs: (id, lines) => s.daemonLogs(id, lines),
    recoveryBranch: (id) => s.daemonRecovery(id),
    importThread: (t) => s.daemonImport(t.id, t),
  };
}

async function cleanup(e: Env): Promise<void> {
  teardown(e.h);
  rmSync(e.homeRoot, { recursive: true, force: true });
  rmSync(e.localRoot, { recursive: true, force: true });
}

test("handoff: takeover is blocked when another machine owns a live lease", async () => {
  const e = await env();
  try {
    const now = NOW();
    // Seed a thread owned by 'home' with a live lease, mirrored into local's
    // registry (local discovered it).
    const thread = await seedThread("home", e.h, e.homeRoot, e.home, "thread_blk", "blocker", now);
    await e.local.getRegistry().addThread(thread);
    // Cooperative takeover fails because the owner can't be paused.
    e.localT.pauseOk = false;

    const res = await e.local.take("thread_blk");
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes("could not be paused") || res.error?.includes("lease"), res.error);
    // active_machine unchanged.
    const t = await e.local.getRegistry().getThread("thread_blk");
    assert.equal(t?.activeMachine, "m_home");
  } finally {
    await cleanup(e);
  }
});

test("handoff: forced takeover creates recovery branch metadata", async () => {
  const e = await env();
  try {
    const now = NOW();
    const thread = await seedThread("home", e.h, e.homeRoot, e.home, "thread_for", "forceful", now);
    await e.local.getRegistry().addThread(thread);
    e.localT.pauseOk = false; // cooperative would be blocked

    const res = await e.local.take("thread_for", { force: true });
    assert.equal(res.ok, true);
    assert.ok(res.recoveryBranch, "expected a recovery branch name");
    assert.match(res.recoveryBranch!, /^recovery\/thread_for-home-/);

    // The registry records the recovery branch metadata.
    const t = await e.local.getRegistry().getThread("thread_for");
    assert.equal(t?.recoveryBranch, res.recoveryBranch);
    // Ownership transferred to local.
    assert.equal(t?.activeMachine, "m_local");
    assert.equal(t?.leaseOwner, "m_local");
  } finally {
    await cleanup(e);
  }
});

test("handoff: cooperative takeover moves active_machine remote→local", async () => {
  const e = await env();
  try {
    const now = NOW();
    const thread = await seedThread("home", e.h, e.homeRoot, e.home, "thread_co", "coop", now);
    await e.local.getRegistry().addThread(thread);

    const res = await e.local.take("thread_co");
    assert.equal(res.ok, true);
    const t = await e.local.getRegistry().getThread("thread_co");
    assert.equal(t?.activeMachine, "m_local");
    assert.equal(t?.leaseOwner, "m_local");
    // A local worktree was created and recorded.
    assert.ok(t?.workspacePath);
    assert.ok(existsSync(join(t!.workspacePath!, ".git")));
  } finally {
    await cleanup(e);
  }
});

test("handoff: send moves active_machine local→remote", async () => {
  const e = await env();
  try {
    const now = NOW();
    const thread = await seedThread("home", e.h, e.homeRoot, e.home, "thread_send", "sendable", now);
    await e.local.getRegistry().addThread(thread);
    // Local takes it first (cooperative).
    await e.local.take("thread_send");
    // Make the local worktree dirty so a WIP checkpoint is committed.
    const localThread = (await e.local.getRegistry().getThread("thread_send"))!;
    assert.ok(localThread.workspacePath, "take should have created a local worktree");
    append(localThread.workspacePath!, "README.md", "\nlocal edit\n");

    const res = await e.local.send("thread_send", { machine: "home" });
    assert.equal(res.ok, true, res.error);
    const t = await e.local.getRegistry().getThread("thread_send");
    assert.equal(t?.activeMachine, "m_home");
    assert.equal(t?.leaseOwner, "m_home");
  } finally {
    await cleanup(e);
  }
});

test("handoff: send is refused when this machine does not own the lease", async () => {
  const e = await env();
  try {
    const now = NOW();
    const thread = await seedThread("home", e.h, e.homeRoot, e.home, "thread_noown", "x", now);
    await e.local.getRegistry().addThread(thread);

    // local never took the thread; home still owns the live lease.
    const res = await e.local.send("thread_noown", { machine: "home" });
    assert.equal(res.ok, false);
    assert.match(res.error!, /does not own the thread lease/);
  } finally {
    await cleanup(e);
  }
});

test("handoff: sync prepares owned worktrees without touching unowned ones", async () => {
  const e = await env();
  try {
    const now = NOW();
    // One thread owned by home (unowned by local), one taken by local.
    const tHome = await seedThread("home", e.h, e.homeRoot, e.home, "thread_sh", "shared", now);
    // local discovers tHome WITHOUT home's workspace path (it's not local's).
    await e.local.getRegistry().addThread({ ...tHome, workspacePath: null });
    const tOwned = await seedThread("home", e.h, e.homeRoot, e.home, "thread_own", "owned", now);
    await e.local.getRegistry().addThread({ ...tOwned, workspacePath: null });
    await e.local.take("thread_own"); // local now owns thread_own

    const res = await e.local.sync();
    assert.equal(res.fetched, 2);
    // thread_own got a local workspace written.
    const owned = await e.local.getRegistry().getThread("thread_own");
    assert.ok(owned?.workspacePath);
    assert.ok(existsSync(join(owned!.workspacePath!, ".git")), "owned worktree dir exists");
    // thread_sh (home-owned) was skipped — local never created a worktree dir for it.
    const sh = await e.local.getRegistry().getThread("thread_sh");
    assert.equal(sh?.workspacePath, null, "sync must not assign a local workspace to an unowned thread");
    const localSelf = await e.local.self();
    assert.equal(existsSync(join(localSelf.workspaceRoot, "thread_sh")), false, "unowned worktree dir must not exist");
    assert.ok(res.skipped >= 1, "unowned thread must not be mutated by sync");
  } finally {
    await cleanup(e);
  }
});


