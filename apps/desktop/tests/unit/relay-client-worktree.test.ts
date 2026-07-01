import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { checkoutIntoStableWorktree } from "../../electron/services/served-session/checkpoint.ts";

const execFileAsync = promisify(execFile);

/** Run git with a clean identity so tests never depend on global config. */
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Peach Test",
      GIT_AUTHOR_EMAIL: "test@peach.local",
      GIT_COMMITTER_NAME: "Peach Test",
      GIT_COMMITTER_EMAIL: "test@peach.local",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
  return stdout;
}

/** Repo with two commits; returns both shas (oldest first). */
async function setupRepo(root: string): Promise<{ repo: string; shas: [string, string] }> {
  const repo = join(root, "repo");
  await execFileAsync("mkdir", ["-p", repo]);
  await git(["init", "-b", "main"], repo);
  writeFileSync(join(repo, "a.txt"), "one\n");
  await git(["add", "-A"], repo);
  await git(["commit", "-m", "one"], repo);
  const sha1 = (await git(["rev-parse", "HEAD"], repo)).trim();
  writeFileSync(join(repo, "a.txt"), "two\n");
  await git(["add", "-A"], repo);
  await git(["commit", "-m", "two"], repo);
  const sha2 = (await git(["rev-parse", "HEAD"], repo)).trim();
  return { repo, shas: [sha1, sha2] };
}

test("stable worktree: created on first pull, reused (same path) on later pulls", async () => {
  const root = mkdtempSync(join(tmpdir(), "peach-relay-wt-"));
  try {
    const { repo, shas } = await setupRepo(root);
    const dir = join(root, "worktrees", "thread-1");

    // First pull: worktree created, no previous sha.
    const prev1 = await checkoutIntoStableWorktree(repo, dir, shas[0]);
    assert.equal(prev1, null);
    assert.equal((await git(["rev-parse", "HEAD"], dir)).trim(), shas[0]);

    // Second pull: same dir updated in place, previous sha reported.
    const prev2 = await checkoutIntoStableWorktree(repo, dir, shas[1]);
    assert.equal(prev2, shas[0]);
    assert.equal((await git(["rev-parse", "HEAD"], dir)).trim(), shas[1]);

    // Project HEAD untouched throughout.
    assert.equal((await git(["rev-parse", "HEAD"], repo)).trim(), shas[1]);
    assert.equal((await git(["branch", "--show-current"], repo)).trim(), "main");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stable worktree: local edits in the test worktree are forced past", async () => {
  const root = mkdtempSync(join(tmpdir(), "peach-relay-wt-"));
  try {
    const { repo, shas } = await setupRepo(root);
    const dir = join(root, "worktrees", "thread-1");

    await checkoutIntoStableWorktree(repo, dir, shas[0]);
    writeFileSync(join(dir, "a.txt"), "dirty local edit\n");
    const prev = await checkoutIntoStableWorktree(repo, dir, shas[1]);
    assert.equal(prev, shas[0]);
    assert.equal((await git(["rev-parse", "HEAD"], dir)).trim(), shas[1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stable worktree: manually deleted dir is pruned and recreated", async () => {
  const root = mkdtempSync(join(tmpdir(), "peach-relay-wt-"));
  try {
    const { repo, shas } = await setupRepo(root);
    const dir = join(root, "worktrees", "thread-1");

    await checkoutIntoStableWorktree(repo, dir, shas[0]);
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false);

    const prev = await checkoutIntoStableWorktree(repo, dir, shas[1]);
    assert.equal(prev, null); // recreated, not reused
    assert.equal((await git(["rev-parse", "HEAD"], dir)).trim(), shas[1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
