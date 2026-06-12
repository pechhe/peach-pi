import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { GitChangedFile, GitCommitPushResult, GitInfo } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";

const execFileAsync = promisify(execFile);

/** Canonical git CLI boundary (peche-pi's git-runner pattern, no library). */
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function gitOk(args: string[], cwd: string): Promise<boolean> {
  try {
    await git(args, cwd);
    return true;
  } catch {
    return false;
  }
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "thread";

export class GitService {
  private threads: ThreadRepo;
  private projects: ProjectRepo;
  private worktreesDir: string;

  constructor(db: AppDb, worktreesDir: string) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.worktreesDir = worktreesDir;
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
      changedCount: 0,
      insertions: 0,
      deletions: 0,
      ahead: 0,
      behind: 0,
      isWorktree: Boolean(this.threads.get(threadId)?.worktreeDir),
    };
    if (!cwd || !(await gitOk(["rev-parse", "--git-dir"], cwd))) return empty;

    const head = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
    const branch = head === "HEAD" ? null : head; // HEAD = detached
    const status = await git(["status", "--porcelain"], cwd);
    const changedCount = status.split("\n").filter(Boolean).length;

    let insertions = 0;
    let deletions = 0;
    try {
      const stat = (await git(["diff", "--shortstat", "HEAD"], cwd)).trim();
      insertions = Number(/(\d+) insertion/.exec(stat)?.[1] ?? 0);
      deletions = Number(/(\d+) deletion/.exec(stat)?.[1] ?? 0);
    } catch {
      // No HEAD yet (empty repo) — leave zeros.
    }

    let ahead = 0;
    let behind = 0;
    try {
      const counts = (await git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd)).trim();
      const [b, a] = counts.split(/\s+/).map(Number);
      behind = b ?? 0;
      ahead = a ?? 0;
    } catch {
      // No upstream — zeros.
    }

    return { ...empty, isRepo: true, branch, changedCount, insertions, deletions, ahead, behind };
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
      commitMessage = (await generateCommitMessage(diff)) ?? "chore: update";
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

  /** Detached-HEAD worktree under the managed dir (ADR-0003). */
  async createWorktree(projectId: string): Promise<string> {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    mkdirSync(this.worktreesDir, { recursive: true });
    const dir = path.join(this.worktreesDir, randomUUID());
    await git(["worktree", "add", "--detach", dir, "HEAD"], project.path);
    return dir;
  }

  async removeWorktree(projectPath: string, worktreeDir: string): Promise<void> {
    await git(["worktree", "remove", "--force", worktreeDir], projectPath).catch(() => undefined);
  }
}
