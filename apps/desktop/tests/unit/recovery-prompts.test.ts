import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rebaseFailure,
  localMergeFailure,
  pullConflict,
} from "../../electron/services/recovery-prompts.ts";

test("rebaseFailure: embeds issue number and error, keeps recovery wording", () => {
  const prompt = rebaseFailure(42, "CONFLICT (content): Merge conflict in foo.ts");
  assert.match(prompt, /issue #42/);
  assert.match(prompt, /rebase onto main failed/);
  assert.match(prompt, /CONFLICT \(content\): Merge conflict in foo\.ts/);
  assert.match(prompt, /git rebase origin\/main/);
  assert.match(prompt, /git rebase --continue/);
  assert.match(prompt, /git push --force-with-lease/);
  assert.match(prompt, /do not merge yourself/);
});

test("rebaseFailure: preserves exact prose (snapshot of relocated wording)", () => {
  const prompt = rebaseFailure(7, "boom");
  assert.equal(
    prompt,
    "The merge queue couldn't merge issue #7 — the rebase onto " +
      "main failed with:\n\nboom\n\n" +
      "Fix whatever blocked the rebase, then make the branch mergeable again. " +
      "If there are uncommitted changes, commit or stash them. If the rebase " +
      "aborted on a conflict, run `git rebase origin/main` and resolve the " +
      "conflicts in the affected files, then `git rebase --continue` (repeat " +
      "until it completes). Run the full test suite. Once green, force-push " +
      "your branch with `git push --force-with-lease` so the merge queue can " +
      "re-attempt. Then stop at the human gate — do not merge yourself.",
  );
});

test("localMergeFailure: embeds issue number and error, keeps recovery wording", () => {
  const prompt = localMergeFailure(13, "Auto-merge failed");
  assert.match(prompt, /issue #13/);
  assert.match(prompt, /local merge failed/);
  assert.match(prompt, /Auto-merge failed/);
  assert.match(prompt, /commit or stash on the default branch/);
  assert.match(prompt, /commit the merge/);
  assert.match(prompt, /push the default branch/);
  assert.match(prompt, /do not start new work/);
});

test("localMergeFailure: preserves exact prose (snapshot of relocated wording)", () => {
  const prompt = localMergeFailure(1, "err");
  assert.equal(
    prompt,
    "The merge queue couldn't merge issue #1 into the default " +
      "branch — the local merge failed with:\n\nerr\n\n" +
      "Sort it out so the branch can be merged into the default branch. " +
      "If the local repo is dirty, commit or stash on the default branch. " +
      "If the merge hit a conflict, resolve it in the default branch's working " +
      "tree and commit the merge. Run the full test suite. Once green, push " +
      "the default branch. Then stop at the human gate — do not start new work.",
  );
});

test("pullConflict: keeps recovery wording, no context args needed", () => {
  const prompt = pullConflict();
  assert.match(prompt, /git pull --rebase/);
  assert.match(prompt, /rebase conflict/);
  assert.match(prompt, /git rebase --abort/);
  assert.match(prompt, /git rebase --continue/);
  assert.match(prompt, /git push/);
  assert.match(prompt, /git push --force-with-lease/);
  assert.match(prompt, /do not start new work/);
});

test("pullConflict: preserves exact prose (snapshot of relocated wording)", () => {
  assert.equal(
    pullConflict(),
    "A `git pull --rebase` stopped at a rebase conflict.\n\n" +
      "Resolve it so the branch can be pushed. If there are uncommitted " +
      "changes, commit or stash them. If you want a clean slate, run " +
      "`git rebase --abort` to roll back to the pre-pull tip, then " +
      "`git pull --rebase` to re-attempt from a clean tree. If the " +
      "rebase stopped on a conflict, resolve the conflict markers in the " +
      "affected files, then `git rebase --continue` (repeat until it " +
      "completes). Run the full test suite. Once green, push with " +
      "`git push` (or `git push --force-with-lease` if the rebase " +
      "moved past the remote tip). Then stop at the human gate — do not " +
      "start new work.",
  );
});
