import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RemoteCheckpoint } from "@peach-pi/shared-types";
import { git, gitEnv, gitOk } from "@peach-pi/remote-handoff";

/** Branch namespace for disposable checkpoint branches (ADR-0009). A commit
 *  here is transport, not endorsement — squash/cherry-pick the good parts
 *  later, or delete the branch if the work is wrong. */
export function checkpointBranch(threadId: string): string {
  return `wip/${threadId}`;
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
