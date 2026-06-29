import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { recoveryBranchName, wipCommitMessage } from "./ids.ts";
import { git, gitEnv, gitOk, gitOrFail } from "./git-cli.ts";

/**
 * Git boundary for movable execution. Canonical CLI (no library), mirroring
 * the repo's existing git-service / remote-checkpoint pattern.
 *
 * Two invariants shape this module:
 *
 *  1. Branch-per-thread: each thread lives on `peach/<id>-<slug>`, one
 *     worktree per thread per machine (`~/.peach/workspaces/<id>`). We never
 *     flip one checkout between branches.
 *  2. Safety over cleverness at handoff: a dirty tree is never silently
 *     overwritten; a WIP checkpoint is committed before ownership moves; a
 *     forced takeover captures a recovery branch rather than destroying work.
 *
 * Each machine has its own clone of the shared origin, so a thread branch is
 * checked out in at most one local worktree on any given machine — there is
 * no cross-machine "already checked out" conflict. Code travels as git.
 */

/** Is `cwd` inside a git repo? */
export async function isRepo(cwd: string): Promise<boolean> {
  return gitOk(["rev-parse", "--git-dir"], cwd);
}

/** Current branch; null on detached HEAD. */
export async function currentBranch(cwd: string): Promise<string | null> {
  try {
    const head = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    return head === "HEAD" ? null : head;
  } catch {
    return null;
  }
}

/** Repo default branch from origin/HEAD; null if undetermined. */
export async function defaultBranch(cwd: string): Promise<string | null> {
  try {
    const ref = (await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)).trim();
    return ref.replace(/^origin\//, "") || null;
  } catch {
    return null;
  }
}

/** `git fetch --all --prune`. Safe: never mutates the working tree. */
export async function fetchAll(cwd: string): Promise<void> {
  await gitOrFail(["fetch", "--all", "--prune"], cwd, "fetch --all");
}

/** Fetch a single thread branch into a local ref so it can be checked out. */
export async function fetchBranch(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(["fetch", "origin", `+${branch}:${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

export interface WorktreeStatus {
  dirty: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  /** Local branch tip versus origin/<branch>; true if they have diverged. */
  diverged: boolean;
}

/** Snapshot the git state of a worktree for status display. */
export async function worktreeStatus(cwd: string, branch: string | null): Promise<WorktreeStatus> {
  const dirty = Boolean((await safe(["status", "--porcelain"], cwd)).trim());
  const current = await currentBranch(cwd);
  let ahead = 0;
  let behind = 0;
  let diverged = false;
  const ref = branch ?? current;
  if (ref) {
    try {
      const counts = (await git(["rev-list", "--left-right", "--count", `origin/${ref}...${ref}`], cwd)).trim();
      const [b, a] = counts.split(/\s+/).map((n) => Number(n));
      behind = b ?? 0;
      ahead = a ?? 0;
      diverged = ahead > 0 && behind > 0;
    } catch {
      // No upstream — leave zeros (branch not pushed yet).
    }
  }
  return { dirty, branch: current, ahead, behind, diverged };
}

/**
 * Create a worktree for a thread branch off `base`. If the worktree dir already
 * exists as a git worktree on this branch, leave it (idempotent). Returns the
 * dir. `base` defaults to the repo default branch.
 */
export async function ensureWorktree(
  repoPath: string,
  dir: string,
  branch: string,
  base: string,
): Promise<"created" | "exists"> {
  if (isWorktreeDir(dir)) {
    // Already a worktree here — assume it's ours; caller fast-forwards if needed.
    return "exists";
  }
  const hasBranch = await gitOk(["rev-parse", "--verify", `refs/heads/${branch}`], repoPath);
  if (hasBranch) {
    await gitOrFail(["worktree", "add", dir, branch], repoPath, "worktree add");
  } else {
    await gitOrFail(["worktree", "add", "-b", branch, dir, base], repoPath, "worktree add -b");
  }
  return "created";
}

/** Fast-forward a worktree's branch to origin/<branch>. Fails on divergence. */
export async function fastForward(cwd: string, branch: string): Promise<{ ok: true } | { ok: false; diverged: boolean; reason: string }> {
  const st = await worktreeStatus(cwd, branch);
  if (st.diverged) return { ok: false, diverged: true, reason: `${branch} has diverged from origin/${branch}` };
  try {
    await git(["merge", "--ff-only", `origin/${branch}`], cwd);
    return { ok: true };
  } catch (err) {
    const msg = String((err as Error).message || err);
    return { ok: false, diverged: false, reason: msg };
  }
}

/**
 * Auto-WIP checkpoint: stage everything (tracked + untracked, minus ignored),
 * commit on the thread branch. Returns the commit sha, or null when the tree
 * was already clean (nothing to checkpoint).
 *
 * This is a REAL commit on the thread branch (handoff is a deliberate pause,
 * so committing is the correct transport — unlike the desktop app's
 * non-destructive `wip/<sessionId>` snapshot, which must not disturb a live
 * agent). The disposable `wip(...)` message marks it as transport, not
 * endorsement; squash/cherry-pick the good parts, or reset if wrong.
 */
export async function wipCheckpoint(
  cwd: string,
  threadId: string,
  now: Date,
): Promise<string | null> {
  const porcelain = await safe(["status", "--porcelain"], cwd);
  if (!porcelain.trim()) return null;
  const message = `${wipCommitMessage(threadId)}\n\nCheckpoint at ${now.toISOString()}`;
  await gitOrFail(["add", "-A"], cwd, "stage checkpoint");
  try {
    await git(["commit", "-m", message], cwd);
  } catch (err) {
    // A pre-commit hook rejecting, or nothing staged after filters — bail safely.
    await git(["reset", "--mixed"], cwd).catch(() => undefined);
    throw new Error(`WIP checkpoint commit failed: ${String((err as Error).message || err)}`);
  }
  return (await git(["rev-parse", "HEAD"], cwd)).trim();
}

/** Push the thread branch to origin (sets upstream on first push). */
export async function pushBranch(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(["push", "-u", "origin", branch], cwd);
    return true;
  } catch {
    return false;
  }
}

/** HEAD sha of `cwd`, or null. */
export async function headSha(cwd: string): Promise<string | null> {
  try {
    return (await git(["rev-parse", "HEAD"], cwd)).trim();
  } catch {
    return null;
  }
}

/**
 * Create a recovery branch at the *thread branch tip* before a forced
 * takeover overrides ownership. `threadBranch` is the full `peach/<id>-<slug>`
 * name so the ref resolves from any dir in the repo (HEAD in the main clone is
 * the default branch, not the thread branch). Returns the recovery branch name.
 */
export async function createRecoveryBranch(
  repoPath: string,
  threadBranchRef: string,
  threadId: string,
  machineName: string,
  now: Date,
): Promise<string> {
  const name = recoveryBranchName(threadId, machineName, now);
  // Point the recovery ref at the thread branch tip by ref name, not HEAD.
  await git(["branch", name, threadBranchRef], repoPath).catch(async () => {
    // Fallback: origin/<threadBranch> if the local ref is absent.
    await gitOrFail(["branch", name, `origin/${threadBranchRef}`], repoPath, "recovery branch");
  });
  return name;
}

/** Remove a worktree dir from the repo's worktree registry (best effort). */
async function removeWorktree(repoPath: string, dir: string): Promise<void> {
  await git(["worktree", "remove", "--force", "--force", dir], repoPath).catch(() => undefined);
}

/** True if `dir` is itself a git worktree checkout (has a linked .git file). */
function isWorktreeDir(dir: string): boolean {
  try {
    const gitFile = join(dir, ".git");
    return existsSync(gitFile) && statSync(gitFile).isFile();
  } catch {
    return false;
  }
}

/** Non-throwing git stdout ("" on failure) for cheap status probes. */
async function safe(args: string[], cwd: string): Promise<string> {
  try {
    return await git(args, cwd);
  } catch {
    return "";
  }
}

/**
 * Non-destructive snapshot helper (kept for parity with remote-checkpoint.ts):
 * capture the full tree incl. untracked onto a throwaway index + commit-tree,
 * without touching HEAD, the real index, or the working tree. Used only where a
 * real commit is unsafe (e.g. snapshotting a workspace the agent is mid-edit
 * in). The MVP handoff uses the real `wipCheckpoint` above; this is the seam
 * for a future "snapshot without pausing" path.
 */
async function snapshotTree(cwd: string, message: string): Promise<string | null> {
  if (!(await gitOk(["rev-parse", "--git-dir"], cwd))) return null;
  const indexFile = join(tmpdir(), `peach-handoff-idx-${randomBytes(6).toString("hex")}`);
  const env = { GIT_INDEX_FILE: indexFile };
  try {
    const hasHead = await gitOk(["rev-parse", "--verify", "HEAD"], cwd);
    if (hasHead) await gitEnv(["read-tree", "HEAD"], cwd, env);
    await gitEnv(["add", "-A"], cwd, env);
    const tree = (await gitEnv(["write-tree"], cwd, env)).trim();
    const parentArgs = hasHead ? ["-p", "HEAD"] : [];
    return (await gitEnv(["commit-tree", tree, ...parentArgs, "-m", message], cwd, env)).trim();
  } catch {
    return null;
  } finally {
    rmSync(indexFile, { force: true });
  }
}
