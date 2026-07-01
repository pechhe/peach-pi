import { existsSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RemoteCheckpoint } from "@peach-pi/shared-types";
import { git, gitEnv, gitOk } from "@peach-pi/remote-handoff";

/** Single shared branch for disposable checkpoints (ADR-0009). A commit here is
 *  transport, not endorsement — squash/cherry-pick the good parts later, or
 *  delete the branch if the work is wrong. One master → one laptop, so all
 *  sessions snapshot onto this one branch rather than an unbounded set of
 *  `wip/<threadId>` branches; the threadId still rides along in the
 *  RemoteCheckpoint metadata, it just no longer namespaces the branch. */
export function checkpointBranch(_threadId?: string): string {
  return "wip/sync";
}

/**
 * Snapshot a working tree (tracked + untracked) onto `wip/<id>` WITHOUT
 * touching HEAD, the index, or the working tree. Pure-ish: deterministic given
 * a root dir (modeled on record-and-replay/src/store.ts). Returns null when
 * `cwd` is not a git repo.
 *
 * Technique: a throwaway index (GIT_INDEX_FILE) captures the full tree via
 * read-tree HEAD + add -A + write-tree, then commit-tree builds the snapshot.
 * The `wip/<id>` ref points at it via update-ref. The real index and working
 * tree are byte-identical before and after. Same non-destructive technique as
 * GitService.snapshot() (rewind snapshots), but with a written ref.
 */
export async function snapshotToBranch(
  cwd: string,
  threadId: string,
  message = "peach-pi remote checkpoint",
): Promise<string | null> {
  if (!(await gitOk(["rev-parse", "--git-dir"], cwd))) return null;
  const branch = checkpointBranch(threadId);
  const indexFile = path.join(tmpdir(), `peach-pi-ckpt-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: indexFile };
  try {
    const hasHead = await gitOk(["rev-parse", "--verify", "HEAD"], cwd);
    if (hasHead) await gitEnv(["read-tree", "HEAD"], cwd, env);
    await gitEnv(["add", "-A"], cwd, env);
    const tree = (await gitEnv(["write-tree"], cwd, env)).trim();
    // Parent the snapshot on the previous wip/<id> tip if it exists, else HEAD.
    const hasPrev = await gitOk(["rev-parse", "--verify", `refs/heads/${branch}`], cwd);
    const parentArgs = hasPrev
      ? ["-p", branch]
      : hasHead
        ? ["-p", "HEAD"]
        : [];
    const sha = (
      await gitEnv(["commit-tree", tree, ...parentArgs, "-m", message], cwd, env)
    ).trim();
    await git(["update-ref", `refs/heads/${branch}`, sha], cwd);
    return sha;
  } catch {
    return null;
  } finally {
    rmSync(indexFile, { force: true });
  }
}

/** Push a checkpoint branch to origin; false if no remote or push fails. */
export async function pushCheckpoint(cwd: string, threadId: string): Promise<boolean> {
  if (!(await gitOk(["remote", "get-url", "origin"], cwd))) return false;
  try {
    await git(["push", "-f", "origin", `${checkpointBranch(threadId)}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Read the origin URL of a repo (normalized to https, sans .git), or null.
 *  `originUrl` now lives in `@peach-pi/remote-handoff` — it's a git-CLI
 *  concern (the `git remote get-url origin` step + the normalizer). Re-exported
 *  here so the served-session barrel (`index.ts`) still exposes it for callers
 *  that reach the relay's checkpoint surface. */
export { originUrl } from "@peach-pi/remote-handoff";

/** Current tip of `wip/<id>`, or null if the branch does not exist. */
export async function checkpointTip(cwd: string, threadId: string): Promise<string | null> {
  const ok = await gitOk(["rev-parse", "--verify", `refs/heads/${checkpointBranch(threadId)}`], cwd);
  if (!ok) return null;
  return (await git(["rev-parse", checkpointBranch(threadId)], cwd)).trim();
}

/** Check out `sha` (detached) into a stable per-thread worktree, creating it
 *  on first pull — never touches the project's HEAD. Reusing the same path
 *  keeps dev servers watching one dir and lets `node_modules` survive between
 *  pulls (laptop side of ADR-0009). Returns the worktree's previous HEAD sha,
 *  or null when the worktree was (re)created. */
export async function checkoutIntoStableWorktree(
  projectDir: string,
  dir: string,
  sha: string,
): Promise<string | null> {
  if (existsSync(path.join(dir, ".git"))) {
    let prev: string | null = null;
    try {
      prev = (await git(["rev-parse", "HEAD"], dir)).trim() || null;
    } catch {
      prev = null;
    }
    try {
      // The worktree is disposable test space — force past any local edits.
      await git(["checkout", "--force", "--detach", sha], dir);
      return prev;
    } catch {
      // Corrupt/stale worktree — remove and recreate below.
      await git(["worktree", "remove", "--force", dir], projectDir).catch(() => {});
    }
  }
  await mkdir(path.dirname(dir), { recursive: true });
  // Prune stale registrations (e.g. a manually deleted worktree dir) so
  // `worktree add` on the same path doesn't refuse.
  await git(["worktree", "prune"], projectDir).catch(() => {});
  await git(["worktree", "add", "--detach", dir, sha], projectDir);
  return null;
}

/** Record a checkpoint for a thread (snapshot + push), returning the result. */
export async function recordCheckpoint(
  cwd: string,
  threadId: string,
): Promise<RemoteCheckpoint | null> {
  const sha = await snapshotToBranch(cwd, threadId);
  if (!sha) return null;
  const pushed = await pushCheckpoint(cwd, threadId);
  return { threadId, sha, createdAt: new Date().toISOString(), pushed };
}
