/** Agent-recovery prompts for git merge/pull failures. Each builder takes the
 *  issue/error context the IPC handler has at hand and returns the prompt text
 *  sent to the issue's thread to resolve the failure. Pure relocation of the
 *  wording previously inlined in the IPC handler table — no behavioural change
 *  to what the agent is told.
 *
 *  Mirrors the `PARK_FOR_TESTING_PROMPT` pattern in thread-service: the prose
 *  lives in one named place, the call sites stay thin. */

/** The merge-queue rebase onto main failed (dirty tree, conflict, detached
 *  HEAD, …). `rebaseOntoDefault` already aborted/refused, leaving the worktree on
 *  the agent's branch, so the agent can commit/stash, re-run the rebase,
 *  resolve conflicts, push, and stop for the human to re-attempt the merge. */
export function rebaseFailure(issueNumber: number, error: string): string {
  return (
    `The merge queue couldn't merge issue #${issueNumber} — the rebase onto ` +
    `main failed with:\n\n${error}\n\n` +
    `Fix whatever blocked the rebase, then make the branch mergeable again. ` +
    `If there are uncommitted changes, commit or stash them. If the rebase ` +
    `aborted on a conflict, run \`git rebase origin/main\` and resolve the ` +
    `conflicts in the affected files, then \`git rebase --continue\` (repeat ` +
    `until it completes). Run the full test suite. Once green, force-push ` +
    `your branch with \`git push --force-with-lease\` so the merge queue can ` +
    `re-attempt. Then stop at the human gate — do not merge yourself.`
  );
}

/** The merge-queue local merge into the repo's default branch failed (dirty
 *  default branch, merge conflict, …). Mirrors `rebaseFailure` — fail loudly,
 *  no silent PR fallback. */
export function localMergeFailure(issueNumber: number, error: string): string {
  return (
    `The merge queue couldn't merge issue #${issueNumber} into the default ` +
    `branch — the local merge failed with:\n\n${error}\n\n` +
    `Make your branch cleanly mergeable from this worktree — you can't reach ` +
    `the main checkout from here. If the merge hit a conflict, your branch is ` +
    `behind the default branch: run \`git rebase origin/main\` here, resolve ` +
    `the conflicts in the affected files, then \`git rebase --continue\` ` +
    `(repeat until it completes). Run the full test suite. Once green, ` +
    `force-push your branch with \`git push --force-with-lease\` so the ` +
    `merge queue can re-attempt. If instead the main checkout was dirty, that ` +
    `can only be fixed there — flag it for the human. Then stop at the human ` +
    `gate — do not merge yourself.`
  );
}

/** A `git pull --rebase` stopped mid-rebase on the agent's branch (mirrors the
 *  mergeBatch rebase-failure nudge). Fire-and-forget auto-dispatch from the
 *  `git:pull` handler; never blocks the pull result returned to GitWidget. */
export function pullConflict(): string {
  return (
    `A \`git pull --rebase\` stopped at a rebase conflict.\n\n` +
    `Resolve it so the branch can be pushed. If there are uncommitted ` +
    `changes, commit or stash them. If you want a clean slate, run ` +
    `\`git rebase --abort\` to roll back to the pre-pull tip, then ` +
    `\`git pull --rebase\` to re-attempt from a clean tree. If the ` +
    `rebase stopped on a conflict, resolve the conflict markers in the ` +
    `affected files, then \`git rebase --continue\` (repeat until it ` +
    `completes). Run the full test suite. Once green, push with ` +
    `\`git push\` (or \`git push --force-with-lease\` if the rebase ` +
    `moved past the remote tip). Then stop at the human gate — do not ` +
    `start new work.`
  );
}
