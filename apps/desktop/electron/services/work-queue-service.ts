import {
  type BreakdownPrdResult,
  type GitMergeResult,
  type MergeBatchItemResult,
  type MergeBatchOptions,
  type MergeBatchResult,
  type StartAgentResult,
  type StartAllReadyResult,
  type StartPrdAgentResult,
  type TrackedIssue,
  buildSeedPrompt,
  buildPrdAgentPrompt,
  buildPrdBreakdownPrompt,
  issueBranchName,
  issueWorktreeName,
  prdBranchName,
} from "@peach-pi/shared-types";
import type { Emit } from "../ipc/registry.ts";
import type { AppService } from "./app-service.ts";
import type { ThreadService } from "./thread-service.ts";
import type { GitService } from "./git-service.ts";
import type { IssuesService } from "./issues-service.ts";
import { localMergeFailure, rebaseFailure } from "./recovery-prompts.ts";

interface WorkQueueDeps {
  emit: Emit;
  appService: AppService;
  threadService: ThreadService;
  gitService: GitService;
  issuesService: IssuesService;
}

/**
 * Owns the Work Queue feature: launching agents on ready issues / PRDs, and the
 * batch-merge state machine. Previously these lived as inline closures in the
 * IPC table; sunk here so the riskiest logic (the merge queue) is testable in
 * isolation and the IPC table goes back to being a declarative unit.
 */
export class WorkQueueService {
  private emit: Emit;
  private appService: AppService;
  private threadService: ThreadService;
  private gitService: GitService;
  private issuesService: IssuesService;

  constructor(deps: WorkQueueDeps) {
    this.emit = deps.emit;
    this.appService = deps.appService;
    this.threadService = deps.threadService;
    this.gitService = deps.gitService;
    this.issuesService = deps.issuesService;
  }

  /** Launch one agent on an isolated worktree+branch for a ready issue, seeded
   *  with the issue (and its parent PRD) context. Shared by the single-issue
   *  startAgent and the PRD-level startAllReady. */
  private async launchIssueAgent(
    projectId: string,
    issue: TrackedIssue,
    allIssues: TrackedIssue[],
  ): Promise<string> {
    const dir = await this.gitService.createWorktree(projectId);
    await this.gitService.branchWorktree(dir, issueBranchName(issue.number, issue.title));
    const wt = this.appService.addWorktree(projectId, dir, issueWorktreeName(issue.number));
    const thread = await this.threadService.createThread(projectId, { worktreeId: wt.id });
    await this.applyPinnedProjectPrefs(projectId, thread.id);
    const parentPrd =
      issue.parent != null
        ? (allIssues.find((i) => i.number === issue.parent && i.isPrd) ?? null)
        : null;
    const workflow =
      this.appService.snapshot().projects.find((p) => p.id === projectId)?.mergeWorkflow ?? "pr";
    await this.threadService.prompt(thread.id, buildSeedPrompt(issue, parentPrd, workflow));
    return thread.id;
  }

  /** Apply a project's pinned Work Queue model/thinking overrides to a freshly
   *  created thread, before prompting. null = leave pi's default alone. Mirrors
   *  AutomationService.fire, which pins the model before the first prompt. */
  private async applyPinnedProjectPrefs(projectId: string, threadId: string): Promise<void> {
    const project = this.appService.snapshot().projects.find((p) => p.id === projectId);
    if (!project) return;
    if (project.agentModel) {
      await this.threadService.setModel(
        threadId,
        project.agentModel.provider,
        project.agentModel.id,
      );
    }
    if (project.agentThinking) {
      await this.threadService.setThinking(threadId, project.agentThinking);
    }
  }

  async startAgent(projectId: string, issueNumber: number): Promise<StartAgentResult> {
    const res = await this.issuesService.list(projectId);
    if (!res.ok) return { ok: false, reason: "error", message: res.reason };
    const issue = res.issues.find((i) => i.number === issueNumber);
    if (!issue) return { ok: false, reason: "error", message: "Issue not found" };
    if (issue.inProgress) return { ok: false, reason: "in-progress" };
    if (issue.status !== "ready") return { ok: false, reason: "not-ready" };
    const threadId = await this.launchIssueAgent(projectId, issue, res.issues);
    return { ok: true, threadId };
  }

  async startAllReady(projectId: string, prdNumber: number): Promise<StartAllReadyResult> {
    const res = await this.issuesService.list(projectId);
    if (!res.ok) return { ok: false, reason: "error", message: res.reason };
    // Ready, not-in-progress children of this PRD. Blocked + in-progress are
    // skipped by construction. Launch sequentially so worktree creation does
    // not race on the shared repo.
    const ready = res.issues.filter(
      (i) => i.parent === prdNumber && i.status === "ready" && !i.inProgress,
    );
    const launched: Array<{ issueNumber: number; threadId: string }> = [];
    for (const issue of ready) {
      const threadId = await this.launchIssueAgent(projectId, issue, res.issues);
      launched.push({ issueNumber: issue.number, threadId });
    }
    return { ok: true, launched };
  }

  async startAllReadyGlobal(projectId: string): Promise<StartAllReadyResult> {
    const res = await this.issuesService.list(projectId);
    if (!res.ok) return { ok: false, reason: "error", message: res.reason };
    const ready = res.issues.filter((i) => i.status === "ready" && !i.inProgress);
    const launched: Array<{ issueNumber: number; threadId: string }> = [];
    for (const issue of ready) {
      const threadId = await this.launchIssueAgent(projectId, issue, res.issues);
      launched.push({ issueNumber: issue.number, threadId });
    }
    return { ok: true, launched };
  }

  /** Break a childless PRD into issues via the to-issues skill. Runs on a
   *  thread rooted in the project working dir — no worktree, since the skill
   *  edits the tracker (gh issue create), not repo files. */
  async breakdownPrd(projectId: string, prdNumber: number): Promise<BreakdownPrdResult> {
    const res = await this.issuesService.list(projectId);
    if (!res.ok) return { ok: false, reason: "error", message: res.reason };
    const prd = res.issues.find((i) => i.number === prdNumber && i.isPrd);
    if (!prd) return { ok: false, reason: "error", message: "PRD not found" };
    const thread = await this.threadService.createThread(projectId);
    await this.applyPinnedProjectPrefs(projectId, thread.id);
    await this.threadService.prompt(thread.id, buildPrdBreakdownPrompt(prd));
    return { ok: true, threadId: thread.id };
  }

  /** Launch an agent directly on a childless PRD: isolated worktree+branch,
   *  seeded with the PRD body. The resulting PR closes the PRD issue itself. */
  async startPrdAgent(projectId: string, prdNumber: number): Promise<StartPrdAgentResult> {
    const res = await this.issuesService.list(projectId);
    if (!res.ok) return { ok: false, reason: "error", message: res.reason };
    const prd = res.issues.find((i) => i.number === prdNumber && i.isPrd);
    if (!prd) return { ok: false, reason: "error", message: "PRD not found" };
    const dir = await this.gitService.createWorktree(projectId);
    await this.gitService.branchWorktree(dir, prdBranchName(prd.number, prd.title));
    const wt = this.appService.addWorktree(projectId, dir, `prd-${prd.number}`);
    const thread = await this.threadService.createThread(projectId, { worktreeId: wt.id });
    await this.applyPinnedProjectPrefs(projectId, thread.id);
    const workflow =
      this.appService.snapshot().projects.find((p) => p.id === projectId)?.mergeWorkflow ?? "pr";
    await this.threadService.prompt(thread.id, buildPrdAgentPrompt(prd, workflow));
    return { ok: true, threadId: thread.id };
  }

  async mergeBatch(
    projectId: string,
    issueNumbers: number[],
    opts?: MergeBatchOptions,
  ): Promise<MergeBatchResult> {
    // Look up the thread (hence the git cwd) for each issue via its worktree
    // record name `issue-<n>`. Issues without a known worktree thread are
    // returned as rebase-phase failures — the caller can still proceed on
    // the rest.
    const snap = this.appService.snapshot();
    const projectWorktrees = snap.worktrees.filter(
      (w) => w.projectId === projectId && w.archivedAt == null,
    );
    // Issue titles for (re)created PR bodies. Best-effort: a failed fetch
    // falls back to a generic title so the batch still proceeds.
    const issueTitles = new Map<number, string>();
    const listRes = await this.issuesService.list(projectId);
    if (listRes.ok) for (const i of listRes.issues) issueTitles.set(i.number, i.title);
    const titleFor = (n: number) => issueTitles.get(n) ?? `Issue #${n}`;
    const items: MergeBatchItemResult[] = [];
    // Recovery is sequential: at most one agent is nudged per batch run, so
    // we never kick off several threads resolving conflicts concurrently.
    // Clean items still merge; the next blocked item is handled on the
    // user's next merge attempt, once this agent has finished.
    let nudged = false;
    for (const issueNumber of issueNumbers) {
      const wt = projectWorktrees.find((w) => w.name === `issue-${issueNumber}`);
      const thread = wt ? snap.threads.find((t) => t.worktreeId === wt.id) : undefined;
      if (!thread) {
        const item: MergeBatchItemResult = {
          ok: false,
          issueNumber,
          phase: "rebase",
          error: "No worktree thread for this issue",
        };
        items.push(item);
        this.emit("event:mergeProgress", { projectId, issueNumber, phase: "rebase", done: true, item });
        continue;
      }
      const rebaseRes = await this.gitService.rebaseOntoDefault(thread.id);
      if (!rebaseRes.ok) {
        const item = { ok: false as const, issueNumber, phase: "rebase" as const, error: rebaseRes.error };
        items.push(item);
        this.emit("event:mergeProgress", { projectId, issueNumber, phase: item.phase, done: true, item });
        // Nudge the issue's thread to resolve it — the thread is the actor
        // that can fix whatever blocked the rebase (uncommitted changes, a
        // real rebase conflict, a detached HEAD, …). rebaseOntoDefault
        // already aborted/refused, leaving the worktree on the agent's
        // branch, so the agent can commit/stash, re-run the rebase, fix
        // conflicts, push, and stop for the human to re-attempt. Only the
        // first failing item is nudged — sequential recovery.
        if (!nudged) {
          nudged = true;
          await this.threadService
            .prompt(thread.id, rebaseFailure(issueNumber, rebaseRes.error))
            .catch((e) =>
              console.error(`[mergeBatch] failed to prompt thread ${thread.id} for rebase failure:`, e),
            );
        }
        continue;
      }
      // 'local' workflow: merge the worktree branch into the repo's default
      // branch in the project's main checkout, then push. No PR. On
      // failure, nudge the issue's agent to fix it (mirrors the rebase-
      // failure nudge) — fail loudly, no silent PR fallback.
      const workflow =
        snap.projects.find((p) => p.id === projectId)?.mergeWorkflow ?? "pr";
      if (workflow === "local") {
        const mergeRes = await this.gitService.mergeBranchToDefault(thread.id, opts);
        const dirtyLocal = !mergeRes.ok && mergeRes.dirtyLocal === true;
        const item: MergeBatchItemResult = mergeRes.ok
          ? { ok: true, issueNumber, mergedTo: mergeRes.target }
          : dirtyLocal
            ? { ok: false, issueNumber, phase: "merge", error: mergeRes.error, dirtyLocal: true, base: mergeRes.base }
            : { ok: false, issueNumber, phase: "merge", error: mergeRes.error };
        items.push(item);
        this.emit("event:mergeProgress", { projectId, issueNumber, phase: "merge", done: true, item });
        if (mergeRes.ok) {
          // No PR means no GitHub `Closes #N` auto-close, so close the
          // issue explicitly — the local-workflow equivalent. Best-effort:
          // a close failure must not undo a merge that already landed.
          await this.issuesService.close(projectId, issueNumber, "completed").catch((e) =>
            console.error(`[mergeBatch] failed to close issue #${issueNumber}:`, e),
          );
          await this.appService.archive(wt!.id).catch((e) =>
            console.error(`[mergeBatch] failed to archive worktree ${wt!.id}:`, e),
          );
        } else if (!dirtyLocal && !nudged) {
          // Dirty-local is a human/local concern (the user's WIP), not the
          // agent's — surface it for a stash-and-retry action instead of
          // nudging. Real conflicts still nudge the agent, one per batch.
          nudged = true;
          await this.threadService
            .prompt(thread.id, localMergeFailure(issueNumber, mergeRes.error))
            .catch((e) =>
              console.error(`[mergeBatch] failed to prompt thread ${thread.id} for local merge failure:`, e),
            );
        }
        continue;
      }
      // 'pr' workflow: ensure an OPEN PR exists for this branch. A force-
      // push after a rebase-conflict fix can leave the original PR closed
      // (e.g. GitHub auto-closes a PR whose head briefly matched the
      // base). ensureOpenPr recreates a fresh `Closes #N` PR in that case
      // so the queue can finish the merge instead of dead-ending on "PR
      // is closed".
      const ensured = await this.gitService.ensureOpenPr(
        thread.id,
        issueNumber,
        titleFor(issueNumber),
      );
      const mergeRes = ensured.ok
        ? await this.gitService.mergePr(thread.id)
        : ensured;
      const item: MergeBatchItemResult = mergeRes.ok
        ? { ok: true, issueNumber, prUrl: mergeRes.prUrl }
        : { ok: false, issueNumber, phase: "merge", error: mergeRes.error };
      items.push(item);
      this.emit("event:mergeProgress", { projectId, issueNumber, phase: "merge", done: true, item });
      if (mergeRes.ok) {
        // Pull main locally so the next item in the batch sees a current
        // project repo. Best-effort — a pull failure does not fail the
        // merge that already landed on GitHub.
        await this.gitService.pull(thread.id).catch(() => undefined);
        // The issue shipped + its PR merged, so the isolated worktree
        // (git checkout + DB record) and its thread are no longer needed.
        // `appService.archive` is the full teardown: archives the worktree
        // record (drops it from the sidebar), archives every live thread
        // in it (drops them from the sidebar), and `git worktree remove`s
        // the checkout dir so the git process is cleaned up too.
        await this.appService.archive(wt!.id).catch((e) =>
          console.error(`[mergeBatch] failed to archive worktree ${wt!.id}:`, e),
        );
      }
    }
    return { ok: true, items };
  }

  /** Run the local merge pipeline (rebase → check → merge into the default
   *  branch) for a worktree thread. When the worktree is linked to a
   *  work-queue issue (`issue-<n>`), close that issue — the local-merge
   *  equivalent of a PR's `Closes #N`, so the Work Queue reflects "done".
   *  Worktree teardown stays the user's choice (the GitWidget buttons). */
  async mergeToLocalAndCloseIssue(
    threadId: string,
    opts?: { stashLocal?: boolean },
  ): Promise<GitMergeResult> {
    const result = await this.gitService.mergeToLocal(threadId, opts);
    if (!result.ok) return result;
    const snap = this.appService.snapshot();
    const wtId = snap.threads.find((t) => t.id === threadId)?.worktreeId;
    const wt = wtId ? snap.worktrees.find((w) => w.id === wtId) : undefined;
    const issueNumber = wt ? Number(/^issue-(\d+)$/.exec(wt.name)?.[1] ?? NaN) : NaN;
    if (wt && Number.isFinite(issueNumber)) {
      await this.issuesService.close(wt.projectId, issueNumber, "completed").catch((e) =>
        console.error(`[mergeToLocal] failed to close issue #${issueNumber}:`, e),
      );
    }
    return result;
  }
}
