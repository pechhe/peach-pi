import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type {
  GitChangedFile,
  GitCommitPushResult,
  GitInfo,
  GitMergeResult,
  GitPrResult,
  GitMergePrResult,
  GitPullResult,
  GitPushLocalResult,
  GitRebaseResult,
  ModelInfo,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import { git, gitEnv, gitOk, gitRead, gitReadOk, toHttpsRepoUrl } from "@peach-pi/remote-handoff";

const runExec = promisify(execFile);

/** Run a `gh` CLI command, returning trimmed stdout. Throws on non-zero
 *  exit or `gh` being absent. */
async function runGh(args: string[], cwd: string): Promise<string> {
  const { stdout } = await runExec("gh", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "thread";

/** Resolve a `git worktree add` path argument to an absolute dir, returning
 *  null unless it's a sibling or child of the project root (not under
 *  peach-pi's own managed worktrees dir). The agent-invoked `git worktree add`
 *  runs with the project checkout as cwd, so relative paths resolve against
 *  the project path. Tildes are expanded; anything unresolved is rejected.
 *  Retained for the future user-driven adoption flow; the agent-driven caller
 *  was removed to pin thread environments to their creation cwd. */
function resolveWorktreeDir(
  rawPath: string,
  projectPath: string,
  managedWorktreesDir: string,
): string | null {
  if (!rawPath) return null;
  const expanded = rawPath.startsWith("~")
    ? path.join(process.env.HOME ?? "~", rawPath.slice(1))
    : rawPath;
  const dir = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(projectPath, expanded);
  if (dir === projectPath) return null;
  // Never adopt a path inside peach-pi's own managed worktrees dir: those are
  // created by the IPC `createWorktree` flow and tracked via `Worktree` rows,
  // so adopting one here would double-track it.
  const relManaged = path.relative(managedWorktreesDir, dir);
  if (relManaged && !path.isAbsolute(relManaged) && !relManaged.startsWith("..")) {
    return null;
  }
  return dir;
}

export class GitService {
  private threads: ThreadRepo;
  private projects: ProjectRepo;
  private worktreesDir: string;
  /** Reads the persisted utility-model selection; null = defaults. */
  private getUtilityModel: () => ModelInfo | null;

  constructor(db: AppDb, worktreesDir: string, getUtilityModel?: () => ModelInfo | null) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.worktreesDir = worktreesDir;
    this.getUtilityModel = getUtilityModel ?? (() => null);
  }

  /** Working directory for a thread: worktree > project > chat workspace. */
  cwdFor(threadId: string): string | null {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    if (thread.worktreeDir) return thread.worktreeDir;
    if (thread.projectId) {
      return this.projects.all().find((p) => p.id === thread.projectId)?.path ?? null;
    }
    return thread.chatWorkspaceDir ?? null;
  }

  async info(threadId: string): Promise<GitInfo> {
    const cwd = this.cwdFor(threadId);
    const empty: GitInfo = {
      isRepo: false,
      branch: null,
      defaultBranch: null,
      changedCount: 0,
      insertions: 0,
      deletions: 0,
      ahead: 0,
      behind: 0,
      isWorktree: Boolean(this.threads.get(threadId)?.worktreeDir),
      mergedToLocal: false,
    };
    if (!cwd || !(await gitReadOk(["rev-parse", "--git-dir"], cwd))) return empty;

    const head = (await gitRead(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    const branch = head === "HEAD" ? null : head; // HEAD = detached
    const status = await gitRead(["status", "--porcelain"], cwd);
    const changedCount = status.split("\n").filter(Boolean).length;

    let insertions = 0;
    let deletions = 0;
    try {
      const stat = (await gitRead(["diff", "--shortstat", "HEAD"], cwd)).trim();
      insertions = Number(/(\d+) insertion/.exec(stat)?.[1] ?? 0);
      deletions = Number(/(\d+) deletion/.exec(stat)?.[1] ?? 0);
    } catch {
      // No HEAD yet (empty repo) — leave zeros.
    }

    let ahead = 0;
    let behind = 0;
    try {
      const counts = (await gitRead(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd)).trim();
      const [b, a] = counts.split(/\s+/).map(Number);
      behind = b ?? 0;
      ahead = a ?? 0;
    } catch {
      // No upstream — zeros.
    }

    const defaultBranch = await this.defaultBranch(cwd);
    const mergedToLocal = branch ? await this.isMergedToLocal(threadId, cwd) : false;

    return { ...empty, isRepo: true, branch, defaultBranch, changedCount, insertions, deletions, ahead, behind, mergedToLocal };
  }

  /** Local project repo path for a worktree thread; null otherwise. */
  private projectPathFor(threadId: string): string | null {
    const thread = this.threads.get(threadId);
    if (!thread?.worktreeDir || !thread.projectId) return null;
    return this.projects.all().find((p) => p.id === thread.projectId)?.path ?? null;
  }

  /** True when the worktree's HEAD is already an ancestor of the local
   *  project's default branch (work merged back). Falls back to the local
   *  checkout's current branch when no default branch is determinable. */
  private async isMergedToLocal(threadId: string, cwd: string): Promise<boolean> {
    const projectPath = this.projectPathFor(threadId);
    if (!projectPath) return false;
    try {
      const wtHead = (await gitRead(["rev-parse", "HEAD"], cwd)).trim();
      const target =
        (await this.defaultBranch(projectPath)) ??
        (await gitRead(["rev-parse", "--abbrev-ref", "HEAD"], projectPath)).trim();
      return await gitReadOk(["merge-base", "--is-ancestor", wtHead, target], projectPath);
    } catch {
      return false;
    }
  }

  /** Repo default branch from origin/HEAD, falling back to a local
   *  `main`/`master` for repos without a remote; null when undetermined. */
  private async defaultBranch(cwd: string): Promise<string | null> {
    try {
      const ref = (await gitRead(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)).trim();
      const name = ref.replace(/^origin\//, "");
      if (name) return name;
    } catch {
      // No origin/HEAD — fall through to local detection.
    }
    for (const name of ["main", "master"]) {
      if (await gitReadOk(["rev-parse", "--verify", `refs/heads/${name}`], cwd)) return name;
    }
    return null;
  }

  /** Run the project's optional check command (typecheck/tests) in `cwd` —
   *  the local workflow's CI substitute, run post-rebase and pre-merge. A
   *  missing/empty command passes. On failure the error carries the tail of
   *  the command output so the nudged agent (or the user) sees what broke. */
  private async runCheck(
    threadId: string,
    cwd: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const thread = this.threads.get(threadId);
    const project = thread?.projectId
      ? this.projects.all().find((p) => p.id === thread.projectId)
      : null;
    const command = project?.checkCommand?.trim();
    if (!command) return { ok: true };
    try {
      await runExec("/bin/sh", ["-lc", command], {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15 * 60 * 1000,
      });
      return { ok: true };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const combined = `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim();
      const tail = combined.split("\n").filter(Boolean).slice(-20).join("\n");
      return { ok: false, error: `Check failed (\`${command}\`):\n${tail || err.message || String(e)}` };
    }
  }

  async changedFiles(threadId: string): Promise<GitChangedFile[]> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return [];
    let status: string;
    try {
      status = await git(["status", "--porcelain"], cwd);
    } catch {
      return [];
    }
    return status
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const x = line[0]!;
        const y = line[1]!;
        const filePath = line.slice(3).split(" -> ").pop()!.trim();
        const code = x !== " " && x !== "?" ? x : y;
        const statusName: GitChangedFile["status"] =
          x === "?" ? "untracked"
          : code === "A" ? "added"
          : code === "D" ? "deleted"
          : code === "R" ? "renamed"
          : "modified";
        return { path: filePath, status: statusName, staged: x !== " " && x !== "?" };
      });
  }

  async fileDiff(threadId: string, filePath: string): Promise<string> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return "";
    try {
      const unstaged = await git(["diff", "--", filePath], cwd);
      if (unstaged) return unstaged;
      const staged = await git(["diff", "--cached", "--", filePath], cwd);
      if (staged) return staged;
    } catch {
      return "";
    }
    // Untracked: diff against /dev/null (exits 1 when a diff exists).
    try {
      await git(["diff", "--no-index", "--", "/dev/null", filePath], cwd);
      return "";
    } catch (err) {
      const stdout = (err as { stdout?: string }).stdout;
      return typeof stdout === "string" ? stdout : "";
    }
  }

  /**
   * Semi-auto commit & push: stage all, LLM commit message (fallback static),
   * lazy branch when detached (worktree threads), push with upstream.
   */
  async commitPush(threadId: string, message?: string): Promise<GitCommitPushResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd))) return { ok: false, error: "Not a git repository" };
    if (!(await git(["status", "--porcelain"], cwd)).trim() ) {
      return { ok: false, error: "Nothing to commit" };
    }

    await git(["add", "-A"], cwd);
    let commitMessage = message?.trim();
    if (!commitMessage) {
      const diff = await git(["diff", "--staged"], cwd);
      const { generateCommitMessage } = await import("@peach-pi/pi-client");
      commitMessage = (await generateCommitMessage(diff, this.getUtilityModel())) ?? "chore: update";
    }
    try {
      await git(["commit", "-m", commitMessage], cwd);
    } catch (err) {
      await git(["reset", "HEAD"], cwd).catch(() => undefined);
      return { ok: false, error: `Commit failed: ${String(err)}` };
    }

    // Lazy branch (ADR-0003): detached worktree gets a branch on first commit.
    let branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (branch === "HEAD") {
      const title = this.threads.get(threadId)?.title ?? "thread";
      branch = `pi/${slug(title)}-${randomUUID().slice(0, 6)}`;
      await git(["switch", "-c", branch], cwd);
    }

    const hasUpstream = await gitOk(["rev-parse", "--abbrev-ref", "@{u}"], cwd);
    try {
      await git(hasUpstream ? ["push"] : ["push", "-u", "origin", branch], cwd);
      return { ok: true, branch, message: commitMessage, pushed: true };
    } catch {
      return { ok: true, branch, message: commitMessage, pushed: false };
    }
  }

  /**
   * Open the GitHub "create PR" (compare) page for the current branch against
   * the repo default branch. No PR when on the default branch.
   */
  async createPr(threadId: string): Promise<GitPrResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd))) return { ok: false, error: "Not a git repository" };

    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (branch === "HEAD") return { ok: false, error: "Detached HEAD — commit first" };
    const base = await this.defaultBranch(cwd);
    if (!base) return { ok: false, error: "No default branch (origin/HEAD)" };
    if (branch === base) return { ok: false, error: `On ${base} — switch to a feature branch first` };

    let remoteUrl: string;
    try {
      remoteUrl = (await git(["remote", "get-url", "origin"], cwd)).trim();
    } catch {
      return { ok: false, error: "No 'origin' remote" };
    }
    const repoUrl = toHttpsRepoUrl(remoteUrl);
    if (!repoUrl) return { ok: false, error: `Unsupported remote URL: ${remoteUrl}` };

    const url = `${repoUrl}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
    await shell.openExternal(url);
    return { ok: true, url };
  }

  /** Merge this thread's open PR on GitHub (squash + delete branch). Used by
   *  the per-thread "Merge PR" button after the human has verified the work.
   *  Resolves the PR for the thread's current branch via `gh pr view`, then
   *  merges it with `--squash --delete-branch`. On success the PR's `Closes #N`
   *  body keyword auto-closes the linked issue on GitHub. */
  async mergePr(threadId: string): Promise<GitMergePrResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (!branch || branch === "HEAD")
      return { ok: false, error: "No branch to merge (detached HEAD)" };
    try {
      const view = await runGh(
        ["pr", "view", "--json", "number,url,state,baseRefName"],
        cwd,
      );
      const pr = JSON.parse(view) as { number: number; url: string; state: string };
      if (pr.state !== "OPEN")
        return { ok: false, error: `PR is ${pr.state.toLowerCase()}, not open` };
      await runGh(["pr", "merge", String(pr.number), "--squash", "--delete-branch"], cwd);
      return { ok: true, prNumber: pr.number, prUrl: pr.url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Ensure the thread's branch has an OPEN PR, (re)creating one via `gh pr
   *  create` if it's missing or closed-unmerged. Used by the merge queue when a
   *  force-push revived a diff after GitHub auto-closed the original PR (a
   *  branch identical to base → GitHub closes; once divergent again, reopen).
   *  Resolves the existing PR via `gh pr view`; when open, returns it; when
   *  closed/absent, creates a fresh squash-target with a `Closes #N` body. */
  async ensureOpenPr(
    threadId: string,
    issueNumber: number,
    issueTitle: string,
  ): Promise<GitMergePrResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (!branch || branch === "HEAD")
      return { ok: false, error: "No branch (detached HEAD)" };
    const base = await this.defaultBranch(cwd);
    if (!base) return { ok: false, error: "No default branch (origin/HEAD)" };
    try {
      const view = await runGh(["pr", "view", "--json", "number,url,state"], cwd);
      const pr = JSON.parse(view) as { number: number; url: string; state: string };
      if (pr.state.toUpperCase() === "OPEN") return { ok: true, prNumber: pr.number, prUrl: pr.url };
      // Closed/unmerged: recreate so the merge queue has something to merge.
      const title = `Issue #${issueNumber}: ${issueTitle}`;
      const body = `Closes #${issueNumber}`;
      const url = await runGh(
        ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body],
        cwd,
      );
      const num = Number(/\/pull\/(\d+)$/.exec(url)?.[1] ?? 0);
      return { ok: true, prNumber: num, prUrl: url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** The shared "integrate while dirty" invariant behind {@link mergeToLocal}
   *  and {@link mergeBranchToDefault}: stash dirty local work → (optionally)
   *  check out `target` → merge `branch` with --no-ff → (optionally) push
   *  `target` → restore the stash, keeping it if the pop conflicts. Aborts the
   *  merge cleanly on conflict. `target` is the destination branch in all its
   *  roles (checkout, push, and conflict/result messaging). */
  private async mergeNoFfWithStash(
    projectPath: string,
    branch: string,
    target: string,
    opts: { stashMessage: string; dirty: boolean; checkout?: boolean; push?: boolean },
  ): Promise<GitMergeResult> {
    const { stashMessage, dirty } = opts;
    if (dirty) await git(["stash", "push", "-u", "-m", stashMessage], projectPath);

    if (opts.checkout) {
      const current = (await git(["rev-parse", "--abbrev-ref", "HEAD"], projectPath)).trim();
      if (current !== target) {
        try {
          await git(["checkout", target], projectPath);
        } catch (e) {
          if (dirty) await git(["stash", "pop"], projectPath).catch(() => undefined);
          return { ok: false, error: `Could not check out ${target}: ${String(e)}` };
        }
      }
    }

    try {
      await git(["merge", "--no-ff", branch], projectPath);
    } catch {
      await git(["merge", "--abort"], projectPath).catch(() => undefined);
      if (dirty) await git(["stash", "pop"], projectPath).catch(() => undefined);
      return { ok: false, error: `Merge conflict on ${target} — aborted`, conflict: true, target, branch };
    }

    const hasRemote = await gitOk(["remote", "get-url", "origin"], projectPath);
    if (opts.push && hasRemote) {
      try {
        await git(["push", "origin", target], projectPath);
      } catch (e) {
        // Merge landed locally but the push failed (e.g. rejected non-fast-
        // forward). Restore stashed work so the user isn't left mid-pop, then
        // surface as a warning rather than rolling back the merge.
        if (dirty) await git(["stash", "pop"], projectPath).catch(() => undefined);
        return { ok: true, target, branch, hasRemote, warning: `Merged into ${target} but push failed: ${String(e)}` };
      }
    }

    if (dirty) {
      // pop succeeds silently; on conflict it leaves markers + keeps the stash.
      const restored = await gitOk(["stash", "pop"], projectPath);
      if (!restored)
        return {
          ok: true,
          target,
          branch,
          hasRemote,
          warning: "local changes conflict with the merge — resolve in working tree (stash kept)",
        };
    }
    return { ok: true, target, branch, hasRemote };
  }

  /**
   * The GitWidget "Merge to local" pipeline — the same lane as the Work Queue
   * 'local' workflow: rebase the worktree branch onto the latest default
   * branch (conflicts surface here, in the worktree — not on main), then
   * delegate to {@link mergeBranchToDefault} (check gate → merge --no-ff into
   * the default branch) without pushing — the widget offers the push
   * separately. A dirty main checkout refuses with `dirtyLocal` unless
   * `opts.stashLocal` (the explicit "Stash local & retry" action).
   */
  async mergeToLocal(
    threadId: string,
    opts?: { stashLocal?: boolean },
  ): Promise<GitMergeResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    const thread = this.threads.get(threadId);
    if (!thread?.worktreeDir) return { ok: false, error: "Not a worktree thread" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd))) return { ok: false, error: "Not a git repository" };
    if ((await git(["status", "--porcelain"], cwd)).trim()) return { ok: false, error: "Commit changes first" };

    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (branch === "HEAD") return { ok: false, error: "Nothing committed yet" };

    const rebase = await this.rebaseOntoDefault(threadId);
    if (!rebase.ok) {
      // A real rebase conflict is surfaced with `conflict` + `target` so the
      // UI can hand the resolve to the agent in its own worktree.
      if (rebase.conflict) {
        const base = await this.defaultBranch(cwd);
        return { ok: false, error: rebase.error, conflict: true, target: base ?? undefined, branch };
      }
      return { ok: false, error: rebase.error };
    }

    return this.mergeBranchToDefault(threadId, { stashLocal: opts?.stashLocal, push: false });
  }

  /** Merge a worktree thread's branch into the repo's default branch (e.g.
   *  `main`/`master`) in the project's main checkout, then push the default
   *  branch to origin (`opts.push`, default true — {@link mergeToLocal} passes
   *  false and offers the push separately). The shared merge step of the
   *  local workflow, gated behind a fresh `rebaseOntoDefault` (callers run
   *  it first) and the project's check command — the CI substitute that a PR
   *  would otherwise provide. Leaves the main checkout on the default branch.
   *
   *  A dirty main checkout blocks the merge unless `opts.stashLocal` is set,
   *  in which case the local WIP is stashed + restored around the merge.
   *  Without it the result carries `dirtyLocal` so the caller can offer a
   *  stash-and-retry action. */
  async mergeBranchToDefault(
    threadId: string,
    opts?: { stashLocal?: boolean; push?: boolean },
  ): Promise<GitMergeResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    const thread = this.threads.get(threadId);
    if (!thread?.worktreeDir) return { ok: false, error: "Not a worktree thread" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd)))
      return { ok: false, error: "Not a git repository" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (branch === "HEAD") return { ok: false, error: "Nothing committed yet" };

    const projectPath = this.projectPathFor(threadId);
    if (!projectPath) return { ok: false, error: "No local project repo" };
    const base = await this.defaultBranch(projectPath);
    if (!base) return { ok: false, error: "No default branch" };
    if (branch === base) return { ok: false, error: `Worktree is on ${base} — branch first` };

    // The verification gate: run the project's check command in the worktree
    // (post-rebase) before anything touches the default branch. This is the
    // local workflow's stand-in for PR CI.
    const check = await this.runCheck(threadId, cwd);
    if (!check.ok) return { ok: false, error: check.error, branch };

    // Dirty main checkout blocks a merge unless the caller asked to stash.
    // Without stashing, surface a distinct `dirtyLocal` flag so the UI can
    // offer a "Stash local & retry" action — the user's local WIP is theirs;
    // auto-committing it would push unreviewed work to the default branch.
    // With `stashLocal`, mirror {@link mergeToLocal}: stash -u, merge, push,
    // pop — and keep the stash if the pop conflicts.
    const dirty = Boolean((await git(["status", "--porcelain"], projectPath)).trim());
    if (dirty && !opts?.stashLocal)
      return { ok: false, error: `Local is dirty — stash on ${base} and retry`, dirtyLocal: true, base };

    // Stash (when permitted), check out the default branch, merge --no-ff,
    // push (unless the caller defers it), restore — the shared invariant.
    return this.mergeNoFfWithStash(projectPath, branch, base, {
      stashMessage: "peach-pi merge-local",
      dirty,
      checkout: true,
      push: opts?.push ?? true,
    });
  }

  /** Push the local project repo's current branch (post merge-to-local). */
  async pushLocal(threadId: string): Promise<GitPushLocalResult> {
    const projectPath = this.projectPathFor(threadId);
    if (!projectPath) return { ok: false, error: "No local project repo" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], projectPath)).trim();
    const hasUpstream = await gitOk(["rev-parse", "--abbrev-ref", "@{u}"], projectPath);
    try {
      await git(hasUpstream ? ["push"] : ["push", "-u", "origin", branch], projectPath);
      return { ok: true, branch };
    } catch (err) {
      return { ok: false, error: `Push failed: ${String(err)}` };
    }
  }

  /** Pull the current branch from origin. Fast-forwards when only behind;
   *  rebases local commits on top when branches have diverged (ahead and
   *  behind) so no merge commit is created and origin stays linear. */
  async pull(threadId: string): Promise<GitPullResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd)))
      return { ok: false, error: "Not a git repository" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (branch === "HEAD") return { ok: false, error: "Detached HEAD" };
    if (!(await gitOk(["rev-parse", "--abbrev-ref", "@{u}"], cwd)))
      return { ok: false, error: "No upstream branch to pull from" };
    // Fetch first so ahead/behind counts reflect origin.
    await git(["fetch"], cwd).catch(() => undefined);
    const ahead = Number((await git(["rev-list", "--count", "@{u}..HEAD"], cwd)).trim());
    const behind = Number((await git(["rev-list", "--count", "HEAD..@{u}"], cwd)).trim());
    if (behind === 0) return { ok: true, branch };
    // Refuse to rebase/ff with a dirty tree — gives a cleaner message than the
    // raw git error ("cannot pull with rebase: You have unstaged changes").
    if ((await git(["status", "--porcelain"], cwd)).trim()) {
      return {
        ok: false,
        error: "Cannot pull with uncommitted changes. Commit or stash them first.",
      };
    }
    const rebase = ahead > 0;
    try {
      await git(rebase ? ["pull", "--rebase"] : ["pull", "--ff-only"], cwd);
      return { ok: true, branch };
    } catch (err) {
      const msg = String(err);
      // Rebase may have stopped for conflict resolution (not a hard failure).
      const inProgress = await gitOk(["--no-optional-locks", "rev-parse", "--git-path", "rebase-merge"], cwd);
      if (inProgress) {
        return {
          ok: false,
          conflict: true,
          error: "Pull stopped at a rebase conflict — dispatching a thread to resolve it.",
        };
      }
      return {
        ok: false,
        error: `Pull failed: ${msg}`,
      };
    }
  }

  /** Detached-HEAD worktree under the managed dir (ADR-0003). */
  async createWorktree(projectId: string): Promise<string> {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    mkdirSync(this.worktreesDir, { recursive: true });

    const dir = path.join(this.worktreesDir, randomUUID());
    // Always start the worktree at a clean HEAD. We intentionally do NOT seed
    // the main checkout's uncommitted work into the worktree: copying it
    // duplicated in-flight edits across both trees and made merge-back
    // self-conflict on those same lines. The worktree's in-flight work stays
    // its own; main keeps its uncommitted work untouched and separate.
    await git(["worktree", "add", "--detach", dir, "HEAD"], project.path);
    return dir;
  }

  /** Create and switch a (detached) worktree onto a named branch. Used by the
   *  Work Queue to give an agent worktree a deterministic `agent/issue-<n>-…`
   *  branch at launch instead of waiting for the lazy first-commit branch. */
  async branchWorktree(dir: string, branch: string): Promise<void> {
    await git(["switch", "-c", branch], dir);
  }

  // ── Rewind snapshots (Phase 2) ──────────────────────────────────────
  // Capture the full working tree (incl. untracked) as a dangling commit.
  // Non-destructive: a throwaway index (GIT_INDEX_FILE) keeps the real index
  // and worktree intact. No ref is written — the dangling commit survives the
  // session under git's default prune window, so nothing leaks into the repo.

  /** Snapshot the thread's working tree; null when cwd is not a git repo. */
  async snapshot(threadId: string): Promise<string | null> {
    const cwd = this.cwdFor(threadId);
    if (!cwd || !(await gitOk(["rev-parse", "--git-dir"], cwd))) return null;
    const indexFile = path.join(tmpdir(), `peach-pi-idx-${randomUUID()}`);
    const env = { GIT_INDEX_FILE: indexFile };
    try {
      const hasHead = await gitOk(["rev-parse", "--verify", "HEAD"], cwd);
      if (hasHead) await gitEnv(["read-tree", "HEAD"], cwd, env);
      await gitEnv(["add", "-A"], cwd, env);
      const tree = (await gitEnv(["write-tree"], cwd, env)).trim();
      const args = hasHead
        ? ["commit-tree", tree, "-p", "HEAD", "-m", "peach-pi rewind snapshot"]
        : ["commit-tree", tree, "-m", "peach-pi rewind snapshot"];
      return (await gitEnv(args, cwd, env)).trim();
    } catch {
      return null;
    } finally {
      rmSync(indexFile, { force: true });
    }
  }

  /**
   * Restore the working tree to a snapshot commit. DESTRUCTIVE: discards every
   * change made since the snapshot, including untracked files (`clean -fd`).
   * `.gitignore`d artifacts are preserved.
   */
  async restoreSnapshot(threadId: string, sha: string): Promise<boolean> {
    const cwd = this.cwdFor(threadId);
    if (!cwd || !(await gitOk(["rev-parse", "--git-dir"], cwd))) return false;
    try {
      await git(["read-tree", "--reset", sha], cwd);
      await git(["checkout-index", "-f", "-a"], cwd);
      await git(["clean", "-fd"], cwd);
      return true;
    } catch {
      return false;
    }
  }

  /** Rebase this thread's branch onto the latest default branch (fetched from
   *  origin when one exists; local `main`/`master` otherwise). The first step
   *  of the local merge pipeline: each worktree branch built against an older
   *  main is brought up to date in its own isolated cwd before it is merged,
   *  so conflicts surface here — not on main — and main stays linear. Aborts
   *  cleanly on rebase conflict (flagged `conflict`). The check gate runs
   *  after this, in {@link mergeBranchToDefault}. */
  async rebaseOntoDefault(threadId: string): Promise<GitRebaseResult> {
    const cwd = this.cwdFor(threadId);
    if (!cwd) return { ok: false, error: "No working directory" };
    if (!(await gitOk(["rev-parse", "--git-dir"], cwd)))
      return { ok: false, error: "Not a git repository" };
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    if (!branch || branch === "HEAD") return { ok: false, error: "Detached HEAD — commit first" };
    const base = await this.defaultBranch(cwd);
    if (!base) return { ok: false, error: "No default branch" };
    if (branch === base) return { ok: false, error: `Worktree is on ${base} — branch first` };
    // Fetch the latest default branch so the rebase is against current main,
    // not whatever the worktree last saw.
    await git(["fetch", "origin", base], cwd).catch(() => undefined);
    // Rebase onto the remote-tracking ref when it exists; local-only repos
    // (no origin) rebase onto the local default branch instead.
    const upstream = (await gitOk(["rev-parse", "--verify", `refs/remotes/origin/${base}`], cwd))
      ? `origin/${base}`
      : base;
    // Refuse to rebase with a dirty tree — cleaner than git's raw error.
    if ((await git(["status", "--porcelain"], cwd)).trim()) {
      return { ok: false, error: "Cannot rebase with uncommitted changes. Commit or stash them first." };
    }
    try {
      await git(["rebase", upstream], cwd);
    } catch {
      // Rebase stopped on a conflict. Abort so the worktree is left clean —
      // the caller decides whether to retry, resolve manually, or skip.
      if (await gitOk(["rev-parse", "--git-path", "rebase-merge"], cwd)) {
        await git(["rebase", "--abort"], cwd).catch(() => undefined);
      }
      return { ok: false, error: `Rebase conflict on ${branch} — aborted`, conflict: true };
    }
    return { ok: true, branch, base };
  }

  async removeWorktree(projectPath: string, worktreeDir: string): Promise<void> {
    // `-f -f` overrides locked worktrees (other editors like supacode lock
    // working trees). Without the second `-f`, git refuses and the old code
    // silently swallowed the error, leaving orphaned worktrees in the git
    // registry while peach-pi marked them archived.
    await git(["worktree", "remove", "--force", "--force", worktreeDir], projectPath);
  }
}
