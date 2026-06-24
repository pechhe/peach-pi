import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  ensureWorktree,
  fastForward,
  fetchAll,
  fetchBranch,
  isRepo,
  wipCheckpoint,
  pushBranch,
  worktreeStatus,
  createRecoveryBranch,
  headSha,
  currentBranch,
} from "../src/git.ts";
import { threadBranch, recoveryBranchName } from "../src/ids.ts";
import { join } from "node:path";
import { setupHarness, teardown, worktreePath, write, append, logOneline, git } from "./git-harness.ts";

const NOW = () => new Date("2026-06-24T14:30:00Z");

test("isRepo detects a git dir", async () => {
  const h = await setupHarness();
  try {
    assert.equal(await isRepo(h.home), true);
    assert.equal(await isRepo(h.root), false);
  } finally {
    teardown(h);
  }
});

test("ensureWorktree creates a branch + worktree, idempotent on re-run", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_wt1", "auth flow");
    const dir = worktreePath(h, "wt1");
    const r1 = await ensureWorktree(h.home, dir, branch, "main");
    assert.equal(r1, "created");
    assert.equal(existsSync(join(dir, "README.md")), true);
    assert.equal(await currentBranch(dir), branch);
    // Re-running is a no-op (already a worktree).
    const r2 = await ensureWorktree(h.home, dir, branch, "main");
    assert.equal(r2, "exists");
  } finally {
    teardown(h);
  }
});

test("worktreeStatus reports dirty before clean-after-commit", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_dirty", "x");
    const dir = worktreePath(h, "d");
    await ensureWorktree(h.home, dir, branch, "main");
    let st = await worktreeStatus(dir, branch);
    assert.equal(st.dirty, false);
    append(dir, "README.md", "\nmore\n");
    st = await worktreeStatus(dir, branch);
    assert.equal(st.dirty, true);
  } finally {
    teardown(h);
  }
});

test("wipCheckpoint commits tracked + untracked and marks the message", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_wip", "x");
    const dir = worktreePath(h, "wip");
    await ensureWorktree(h.home, dir, branch, "main");
    // tracked change + a new untracked file
    append(dir, "README.md", "\nedit\n");
    write(dir, "new.txt", "untracked\n");

    const sha = await wipCheckpoint(dir, "thread_wip", NOW());
    assert.ok(sha, "expected a commit sha");
    const messages = (await logOneline(dir)).map((m) => m.toLowerCase());
    assert.ok(messages.some((m) => m.includes("wip(thread_wip)") && m.includes("checkpoint")), messages.join("\n"));

    // Tree is now clean.
    const st = await worktreeStatus(dir, branch);
    assert.equal(st.dirty, false);
  } finally {
    teardown(h);
  }
});

test("wipCheckpoint returns null when the tree is already clean", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_clean", "x");
    const dir = worktreePath(h, "c");
    await ensureWorktree(h.home, dir, branch, "main");
    const sha = await wipCheckpoint(dir, "thread_clean", NOW());
    assert.equal(sha, null);
  } finally {
    teardown(h);
  }
});

test("pushBranch + fastForward round-trips work between two clones", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_ff", "x");
    const dirHome = worktreePath(h, "fh");
    await ensureWorktree(h.home, dirHome, branch, "main");
    append(dirHome, "README.md", "\nhome edit\n");
    await wipCheckpoint(dirHome, "thread_ff", NOW());
    assert.equal(await pushBranch(dirHome, branch), true);

    // The local clone fetches the branch and creates a worktree that fast-forwards.
    await fetchAll(h.local);
    await fetchBranch(h.local, branch);
    const dirLocal = worktreePath(h, "fl");
    await ensureWorktree(h.local, dirLocal, branch, "main");
    const ff = await fastForward(dirLocal, branch);
    assert.equal(ff.ok, true);
    assert.ok(readFileSync(join(dirLocal, "README.md"), "utf8").includes("home edit"));
  } finally {
    teardown(h);
  }
});

test("sync path never overwrites a diverged/dirty local worktree", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_nostomp", "x");
    const dirHome = worktreePath(h, "sh");
    await ensureWorktree(h.home, dirHome, branch, "main");
    append(dirHome, "README.md", "\nhome\n");
    await wipCheckpoint(dirHome, "thread_nostomp", NOW());
    await pushBranch(dirHome, branch);

    await fetchAll(h.local);
    await fetchBranch(h.local, branch);
    const dirLocal = worktreePath(h, "sl");
    await ensureWorktree(h.local, dirLocal, branch, "main");

    // Diverge: local commits something new, home commits something different, pushes.
    append(dirLocal, "local.txt", "local-only\n");
    await git(["add", "-A"], dirLocal);
    await git(["commit", "-m", "local work"], dirLocal);

    append(dirHome, "home.txt", "home-only\n");
    await git(["add", "-A"], dirHome);
    await git(["commit", "-m", "home work"], dirHome);
    await pushBranch(dirHome, branch);
    await fetchAll(h.local);

    // fastForward must REFUSE (divergence), and must NOT destroy local.txt.
    const ff = await fastForward(dirLocal, branch);
    assert.equal(ff.ok, false);
    assert.equal(ff.diverged, true);
    assert.ok(existsSync(join(dirLocal, "local.txt")), "local divergent work was clobbered!");
    // The local commit is still present.
    assert.ok((await logOneline(dirLocal)).some((m) => m.includes("local work")));
  } finally {
    teardown(h);
  }
});

test("createRecoveryBranch captures the current tip under a recovery name", async () => {
  const h = await setupHarness();
  try {
    const branch = threadBranch("thread_rec", "x");
    const dir = worktreePath(h, "rec");
    await ensureWorktree(h.home, dir, branch, "main");
    append(dir, "README.md", "\nrisky\n");
    await wipCheckpoint(dir, "thread_rec", NOW());
    const tipBefore = await headSha(dir);

    const name = await createRecoveryBranch(h.home, branch, "thread_rec", "home", NOW());
    assert.equal(name, recoveryBranchName("thread_rec", "home", NOW()));
    const ref = (await git(["rev-parse", name], h.home)).trim();
    assert.equal(ref, tipBefore, "recovery branch must point at the pre-handoff tip");
  } finally {
    teardown(h);
  }
});


