import { randomBytes } from "node:crypto";

/**
 * Naming for movable-execution threads. Deterministic and collision-light:
 * the thread id is embedded in every derived name so the branch, log path and
 * recovery branch all trace back to one thread without a lookup.
 *
 * Branch namespace is `peach/<id>-<slug>`, intentionally distinct from the
 * desktop app's `wip/<sessionId>` checkpoint branches (ADR-0009) so the two
 * systems never collide on the same repo.
 */

/** Short, lowercase identifier, e.g. `thread_a1b2c3`. */
export function genThreadId(): string {
  return `thread_${randomBytes(3).toString("hex")}`;
}

/** Slugify a free-text description into a branch-safe suffix. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "task";
}

/** Dedicated git branch for a thread, e.g. `peach/thread_a1b2c3-auth-flow`. */
export function threadBranch(threadId: string, name: string): string {
  return `peach/${threadId}-${slugify(name)}`;
}

/** Checkpoint commit message used at every handoff. */
export function wipCommitMessage(threadId: string): string {
  return `wip(${threadId}): checkpoint before handoff`;
}

/**
 * Recovery branch for a forced takeover — captures the losing side's tip so a
 * pre-empted owner can recover unpushed work. Format:
 * `recovery/<threadId>-<machine>-<YYYY-MM-DD-HHMM>`.
 */
export function recoveryBranchName(
  threadId: string,
  machineName: string,
  now: Date,
): string {
  const m = machineName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "machine";
  const ts = stamp(now);
  return `recovery/${threadId}-${m}-${ts}`;
}

/** Per-machine worktree dir name for a thread. */
export function worktreeDirName(threadId: string): string {
  return threadId;
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}
