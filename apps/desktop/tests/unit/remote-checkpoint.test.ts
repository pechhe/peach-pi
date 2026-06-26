import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  snapshotToBranch,
  pushCheckpoint,
  checkpointTip,
  checkpointBranch,
  recordCheckpoint,
  originUrl,
} from "../../electron/services/served-session/checkpoint.ts";

const THREAD = "rt-test-thread";

/** Init a throwaway git repo with a commit; returns its dir. */
function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "peach-ckpt-"));
  run(["init", "-q"], dir);
  run(["config", "user.email", "t@t"], dir);
  run(["config", "user.name", "t"], dir);
  writeFileSync(join(dir, "a.txt"), "a\n");
  run(["add", "-A"], dir);
  run(["commit", "-q", "-m", "init"], dir);
  return dir;
}

function run(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

function headSha(cwd: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();
}

function indexHash(cwd: string): string {
  // Hash of the real index file, to prove the checkpoint left it untouched.
  return hashFile(join(cwd, ".git", "index"));
}

function hashFile(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

test("snapshotToBranch writes wip/<id> including untracked files", async () => {
  const dir = freshRepo();
  try {
    writeFileSync(join(dir, "tracked.txt"), "changed\n");
    writeFileSync(join(dir, "untracked.txt"), "new\n");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "nested.txt"), "deep\n");

    const beforeHead = headSha(dir);
    const beforeIndex = indexHash(dir);
    const beforeStatus = execFileSync("git", ["status", "--porcelain"], { cwd: dir }).toString();

    const sha = await snapshotToBranch(dir, THREAD);
    assert.ok(sha, "snapshot returns a sha");

    // The wip branch points at the snapshot.
    assert.equal(await checkpointTip(dir, THREAD), sha);

    // Untracked + tracked-dirty files are in the snapshot tree.
    const tree = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", `refs/heads/${checkpointBranch(THREAD)}`],
      { cwd: dir },
    ).toString();
    assert.ok(tree.includes("tracked.txt"));
    assert.ok(tree.includes("untracked.txt"));
    assert.ok(tree.includes("sub/nested.txt"));

    // CRITICAL: HEAD, the real index, and the working tree are untouched.
    assert.equal(headSha(dir), beforeHead, "HEAD unchanged");
    assert.equal(indexHash(dir), beforeIndex, "real index untouched");
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], { cwd: dir }).toString(),
      beforeStatus,
      "working tree status unchanged",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshotToBranch returns null for a non-repo directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peach-notrepo-"));
  try {
    const sha = await snapshotToBranch(dir, THREAD);
    assert.equal(sha, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("consecutive snapshots advance the wip branch and stay non-destructive", async () => {
  const dir = freshRepo();
  try {
    writeFileSync(join(dir, "v1.txt"), "1\n");
    const sha1 = await snapshotToBranch(dir, THREAD);
    writeFileSync(join(dir, "v2.txt"), "2\n");
    const sha2 = await snapshotToBranch(dir, THREAD);

    assert.ok(sha1 && sha2);
    assert.notEqual(sha1, sha2, "each checkpoint is a new commit");
    assert.equal(await checkpointTip(dir, THREAD), sha2, "tip advances");

    // HEAD still at init — no commits landed on the real history.
    const log = execFileSync("git", ["log", "--format=%s"], { cwd: dir }).toString();
    assert.equal(log.trim(), "init");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pushCheckpoint returns false when there is no origin", async () => {
  const dir = freshRepo();
  try {
    await snapshotToBranch(dir, THREAD);
    const pushed = await pushCheckpoint(dir, THREAD);
    assert.equal(pushed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("originUrl normalizes ssh and https remotes", async () => {
  const dir = freshRepo();
  try {
    run(["remote", "add", "origin", "git@github.com:pechhe/peach-pi.git"], dir);
    assert.equal(await originUrl(dir), "https://github.com/pechhe/peach-pi");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("originUrl returns null with no remote", async () => {
  const dir = freshRepo();
  try {
    assert.equal(await originUrl(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recordCheckpoint snapshots + reports push=false without origin", async () => {
  const dir = freshRepo();
  try {
    writeFileSync(join(dir, "x.txt"), "x\n");
    const ckpt = await recordCheckpoint(dir, THREAD);
    assert.ok(ckpt);
    assert.equal(ckpt.pushed, false);
    assert.equal(ckpt.threadId, THREAD);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
