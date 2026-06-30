import { app, dialog, shell } from "electron";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  type TrackedIssue,
  type MergeBatchItemResult,
  buildSeedPrompt,
  issueBranchName,
  issueWorktreeName,
  prdBranchName,
  buildPrdBreakdownPrompt,
  buildPrdAgentPrompt,
} from "@peach-pi/shared-types";
import { registerIpcHandlers } from "./ipc/registry.ts";
import { emitDevTapEvent } from "@devtap/electron";
import { getConnectInfo } from "./services/served-session/index.ts";
import {
  getCavemanState,
  setCavemanEnabled,
  setCavemanLevel,
} from "./services/caveman.ts";
import {
  getVisionProxyConfig,
  getVisionProxyInstallState,
  installVisionProxy,
  setVisionProxyMode,
  setVisionProxyModel,
} from "./services/pi-vision-proxy.ts";
import { computePiHealth } from "./services/pi-health.ts";
import { getPiSettings, setPiSettings } from "./services/pi-settings.ts";
import { githubToken } from "./services/issues-service.ts";
import { importTheme } from "./services/theme-import-service.ts";
import {
  rebaseFailure,
  localMergeFailure,
  pullConflict,
} from "./services/recovery-prompts.ts";
import { initMainSentry } from "./services/telemetry-service.ts";
import type { ServiceComposition } from "./compose-services.ts";
import type { HudLifecycle } from "./hud-lifecycle.ts";

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Read a local image file as base64. Returns null on unsupported ext or I/O error. */
async function readImageFile(
  filePath: string,
): Promise<{ mimeType: string; data: string } | null> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = IMAGE_MIME_BY_EXT[ext];
  if (!mimeType) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(filePath);
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

/** Save a skill's markdown to a user-chosen destination. Returns null on cancel or error. */
async function saveSkillFile(skillName: string, filePath: string): Promise<string | null> {
  try {
    const { readFile, writeFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf8");
    const result = await dialog.showSaveDialog({
      title: `Save “${skillName}”`,
      defaultPath: `${skillName}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, content, "utf8");
    return result.filePath;
  } catch {
    return null;
  }
}

/**
 * Register the full IPC handler table: ~150 declarative pass-throughs (channel
 * → bound method) plus ~20 orchestration handlers that call ≥2 services,
 * capture extra args, or run multi-step logic. Split out of `boot()` so the
 * table is a declarative unit (ADR-0009 typed registry unchanged).
 */
export function registerIpcTable(svc: ServiceComposition, hud: HudLifecycle): void {
  const {
    emit,
    appService,
    threadService,
    automationService,
    terminalService,
    recordingService,
    gitService,
    handoffService,
    remoteHost,
    remoteClient,
    issuesService,
    piUpdateService,
    autoUpdateService,
    subagentService,
    sideChatService,
    devTapInstallService,
    fallowService,
    bwsService,
    cliService,
    mcpService,
    executorService,
    cuaDriverService,
    agentBrowserService,
    usageService,
    authService,
    listTailnetPeersDefault,
    enableServe,
  } = svc;

  async function pickProject() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    const dir = result.filePaths[0];
    return result.canceled || !dir ? null : appService.addProject(dir);
  }

  // Launch one agent on an isolated worktree+branch for a ready issue, seeded
  // with the issue (and its parent PRD) context. Shared by the single-issue
  // `workQueue:startAgent` and the PRD-level `workQueue:startAllReady`.
  async function launchIssueAgent(
    projectId: string,
    issue: TrackedIssue,
    allIssues: TrackedIssue[],
  ): Promise<string> {
    const dir = await gitService.createWorktree(projectId);
    await gitService.branchWorktree(dir, issueBranchName(issue.number, issue.title));
    const wt = appService.addWorktree(projectId, dir, issueWorktreeName(issue.number));
    const thread = await threadService.createThread(projectId, { worktreeId: wt.id });
    await applyPinnedProjectPrefs(projectId, thread.id);
    const parentPrd =
      issue.parent != null
        ? (allIssues.find((i) => i.number === issue.parent && i.isPrd) ?? null)
        : null;
    const workflow =
      appService.snapshot().projects.find((p) => p.id === projectId)?.mergeWorkflow ?? "pr";
    await threadService.prompt(thread.id, buildSeedPrompt(issue, parentPrd, workflow));
    return thread.id;
  }

  // Apply a project's pinned Work Queue model/thinking overrides to a freshly
  // created thread, before prompting. null = leave pi's default alone. Mirrors
  // AutomationService.fire, which pins the model before the first prompt.
  async function applyPinnedProjectPrefs(projectId: string, threadId: string): Promise<void> {
    const project = appService.snapshot().projects.find((p) => p.id === projectId);
    if (!project) return;
    if (project.agentModel) {
      await threadService.setModel(
        threadId,
        project.agentModel.provider,
        project.agentModel.id,
      );
    }
    if (project.agentThinking) {
      await threadService.setThinking(threadId, project.agentThinking);
    }
  }

  registerIpcHandlers(
    {
      "app:getSnapshot": appService.snapshot.bind(appService),
      "app:setSelectedThread": appService.setSelectedThread.bind(appService),
      "app:getCavemanState": getCavemanState,
      "app:setCavemanEnabled": setCavemanEnabled,
      "app:setCavemanLevel": setCavemanLevel,
      "app:listModels": appService.listModels.bind(appService),
      "app:getUtilityModel": appService.getUtilityModel.bind(appService),
      "app:setUtilityModel": appService.setUtilityModel.bind(appService),
      "app:getRemoteClientId": appService.getRemoteClientId.bind(appService),
      "app:getAutoCompact": appService.getAutoCompact.bind(appService),
      "app:setAutoCompact": appService.setAutoCompact.bind(appService),
      "app:getPiSettings": getPiSettings,
      "app:getVisionProxyInstallState": getVisionProxyInstallState,
      "app:getVisionProxyConfig": getVisionProxyConfig,
      "app:setVisionProxyModel": setVisionProxyModel,
      "app:setVisionProxyMode": setVisionProxyMode,
      "theme:import": importTheme,
      "app:updateExtensions": piUpdateService.updateNow.bind(piUpdateService),
      "app:getTelemetryConsent": async () => (await getPiSettings()).telemetryConsent,
      "app:setTelemetryConsent": async (consent) => {
        const updated = await setPiSettings({ telemetryConsent: consent });
        emit("event:telemetryConsentChanged", undefined);
        if (consent === true) await initMainSentry(true);
        return updated.telemetryConsent;
      },
      "app:getUpdateStatus": () => autoUpdateService.status,
      "app:installUpdate": () => autoUpdateService.installUpdate(),
      "extensions:remove": piUpdateService.removeExtension.bind(piUpdateService),
      "extensions:deleteLocal": piUpdateService.deleteLocalExtension.bind(piUpdateService),
      "skills:delete": piUpdateService.deleteSkill.bind(piUpdateService),
      "skills:setInvocation": piUpdateService.setSkillInvocation.bind(piUpdateService),
      "extensions:setEnabled": piUpdateService.setEnabledExtension.bind(piUpdateService),
      "mcp:setEnabled": mcpService.setEnabled.bind(mcpService),
      "mcp:list": mcpService.list.bind(mcpService),
      "executor:integrations": executorService.integrations.bind(executorService),
      "executor:connections": executorService.connections.bind(executorService),
      "executor:addConnection": async (integration) => {
        const r = await executorService.addConnection(integration);
        void shell.openExternal(r.url);
        return r;
      },
      "executor:removeConnection": executorService.removeConnection.bind(executorService),
      "executor:addOpenApi": executorService.addOpenApi.bind(executorService),
      "executor:detect": executorService.detect.bind(executorService),
      "executor:catalogue": executorService.catalogue.bind(executorService),
      "executor:openAddPage": async (pluginKey, opts) => {
        void shell.openExternal(executorService.buildAddUrl(pluginKey, opts));
      },
      "bws:status": bwsService.status.bind(bwsService),
      "bws:setAccessToken": bwsService.setAccessToken.bind(bwsService),
      "bws:clearAuth": bwsService.clearAuth.bind(bwsService),
      "bws:setProject": bwsService.setProject.bind(bwsService),
      "bws:install": bwsService.install.bind(bwsService),
      "bws:listProjects": bwsService.listProjects.bind(bwsService),
      "bws:listSecrets": bwsService.listSecrets.bind(bwsService),
      "bws:createSecret": bwsService.createSecret.bind(bwsService),
      "bws:editSecret": bwsService.editSecret.bind(bwsService),
      "bws:deleteSecret": bwsService.deleteSecret.bind(bwsService),
      "cli:list": cliService.list.bind(cliService),
      "cli:refresh": cliService.refresh.bind(cliService),
      "cli:login": cliService.login.bind(cliService),
      "cli:setHidden": cliService.setHidden.bind(cliService),
      "cuaDriver:status": cuaDriverService.status.bind(cuaDriverService),
      "cuaDriver:grantPermissions": cuaDriverService.grantPermissions.bind(cuaDriverService),
      "agentBrowser:state": agentBrowserService.state.bind(agentBrowserService),
      "ui:setSidebarWidth": appService.setSidebarWidth.bind(appService),
      "ui:setSidebarCollapsed": appService.setSidebarCollapsed.bind(appService),
      "ui:setArchiveThreadWorktreeWarningDismissed": appService.setArchiveThreadWorktreeWarningDismissed.bind(appService),
      "projects:add": appService.addProject.bind(appService),
      "projects:remove": appService.removeProject.bind(appService),
      "projects:pick": pickProject,
      "projects:reorder": appService.reorderProjects.bind(appService),
      "projects:setCollapsed": appService.setProjectCollapsed.bind(appService),
      "projects:setMergeWorkflow": appService.setMergeWorkflow.bind(appService),
      "projects:setAgentModel": appService.setAgentModel.bind(appService),
      "projects:setAgentThinking": appService.setAgentThinking.bind(appService),
      "worktrees:rename": appService.renameWorktree.bind(appService),
      "worktrees:archive": appService.archive.bind(appService),
      "threads:create": threadService.createThread.bind(threadService),
      "threads:createChat": threadService.createChat.bind(threadService),
      "threads:clone": threadService.cloneThread.bind(threadService),
      "threads:forkFrom": threadService.forkFrom.bind(threadService),
      "threads:prompt": threadService.prompt.bind(threadService),
      "threads:runCommand": threadService.runCommand.bind(threadService),
      "threads:reload": threadService.reloadSession.bind(threadService),
      "threads:reloadAll": threadService.reloadIdleSessions.bind(threadService),
      "threads:listCommands": threadService.listCommands.bind(threadService),
      "threads:search": threadService.searchThreads.bind(threadService),
      "threads:listModels": threadService.listModels.bind(threadService),
      "threads:listAllModels": threadService.listAllModels.bind(threadService),
      "threads:setModelScoped": threadService.setModelScoped.bind(threadService),
      "threads:setModel": threadService.setModel.bind(threadService),
      "threads:setThinking": threadService.setThinking.bind(threadService),
      "threads:getMeta": threadService.getMeta.bind(threadService),
      "threads:respondExtensionUi": threadService.respondExtensionUi.bind(threadService),
      "threads:terminalCustomInput": threadService.terminalCustomInput.bind(threadService),
      "threads:terminalCustomCancel": threadService.terminalCustomCancel.bind(threadService),
      "threads:compact": threadService.compact.bind(threadService),
      "threads:retryCompact": threadService.retryCompact.bind(threadService),
      "threads:listTurns": threadService.listTurns.bind(threadService),
      "threads:rewind": threadService.rewind.bind(threadService),
      "threads:archive": threadService.archive.bind(threadService),
      "threads:setEnvironment": threadService.setEnvironment.bind(threadService),
      "threads:unarchive": threadService.unarchive.bind(threadService),
      "threads:steer": threadService.steer.bind(threadService),
      "threads:promoteFollowUpToSteer": threadService.promoteFollowUpToSteer.bind(threadService),
      "threads:popLastFollowUp": threadService.popLastFollowUp.bind(threadService),
      "threads:deleteFollowUp": threadService.deleteFollowUp.bind(threadService),
      "threads:deleteSteer": threadService.deleteSteer.bind(threadService),
      "threads:abort": threadService.abort.bind(threadService),
      "threads:getTranscript": threadService.getTranscript.bind(threadService),
      "threads:snooze": appService.snoozeThread.bind(appService),
      "threads:unsnooze": appService.unsnoozeThread.bind(appService),
      "threads:markToTest": threadService.markToTest.bind(threadService),
      "threads:unmarkToTest": appService.unmarkToTest.bind(appService),
      "threads:bringToLocal": threadService.bringWorktreeToLocal.bind(threadService),
      "side:start": sideChatService.start.bind(sideChatService),
      "side:ask": sideChatService.ask.bind(sideChatService),
      "side:list": sideChatService.list.bind(sideChatService),
      "side:get": sideChatService.get.bind(sideChatService),
      "side:delete": sideChatService.delete.bind(sideChatService),
      "automations:create": automationService.create.bind(automationService),
      "automations:update": automationService.update.bind(automationService),
      "automations:setEnabled": automationService.setEnabled.bind(automationService),
      "automations:delete": automationService.delete.bind(automationService),
      "automations:runNow": automationService.runNow.bind(automationService),
      "automations:runs": automationService.runs.bind(automationService),
      "automations:previewNext": automationService.previewNext.bind(automationService),
      "hud:setThread": appService.setHudThread.bind(appService),
      "hud:setAutoReveal": appService.setHudAutoReveal.bind(appService),
      "terminal:open": terminalService.open.bind(terminalService),
      "terminal:input": terminalService.input.bind(terminalService),
      "terminal:resize": terminalService.resize.bind(terminalService),
      "terminal:kill": terminalService.kill.bind(terminalService),
      "terminal:runCommand": (threadId, command) => terminalService.runCommand(threadId, command),
      "dev:detectCommand": async (projectId) => {
        const project = appService.snapshot().projects.find((p) => p.id === projectId);
        if (!project) return null;
        try {
          const pkgPath = path.join(project.path, "package.json");
          const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
            scripts?: Record<string, string>;
          };
          const scripts = pkg.scripts ?? {};
          const cmd = scripts.dev ?? scripts.start ?? scripts.develop;
          return cmd ? (scripts.dev ? "dev" : scripts.start ? "start" : "develop") : null;
        } catch {
          return null;
        }
      },
      "recording:start": recordingService.start.bind(recordingService),
      "recording:stop": recordingService.stop.bind(recordingService),
      "recording:cancel": recordingService.cancel.bind(recordingService),
      "recording:status": recordingService.status.bind(recordingService),
      "recording:revealSkill": recordingService.revealSkill.bind(recordingService),
      "resources:inspect": threadService.inspectResources.bind(threadService),
      "resources:inspectSlotCommand": threadService.inspectSlotCommand.bind(threadService),
      "skills:save": saveSkillFile,
      "files:readImage": readImageFile,
      "subagents:listAgents": subagentService.listAgents.bind(subagentService),
      "subagents:updateAgent": subagentService.updateAgent.bind(subagentService),
      "subagents:readSteps": subagentService.readSteps.bind(subagentService),
      "devtap:projectStatus": devTapInstallService.status.bind(devTapInstallService),
      "fallow:projectStatus": fallowService.status.bind(fallowService),
      "fallow:install": fallowService.install.bind(fallowService),
      "fallow:run": fallowService.run.bind(fallowService),
      "workQueue:list": (projectId) => issuesService.list(projectId),
      "workQueue:startAgent": async (projectId, issueNumber) => {
        const res = await issuesService.list(projectId);
        if (!res.ok) return { ok: false, reason: "error", message: res.reason };
        const issue = res.issues.find((i) => i.number === issueNumber);
        if (!issue) return { ok: false, reason: "error", message: "Issue not found" };
        if (issue.inProgress) return { ok: false, reason: "in-progress" };
        if (issue.status !== "ready") return { ok: false, reason: "not-ready" };
        const threadId = await launchIssueAgent(projectId, issue, res.issues);
        return { ok: true, threadId };
      },
      "workQueue:startAllReady": async (projectId, prdNumber) => {
        const res = await issuesService.list(projectId);
        if (!res.ok) return { ok: false, reason: "error", message: res.reason };
        // Ready, not-in-progress children of this PRD. Blocked + in-progress
        // are skipped by construction. Launch sequentially so worktree
        // creation does not race on the shared repo.
        const ready = res.issues.filter(
          (i) => i.parent === prdNumber && i.status === "ready" && !i.inProgress,
        );
        const launched: Array<{ issueNumber: number; threadId: string }> = [];
        for (const issue of ready) {
          const threadId = await launchIssueAgent(projectId, issue, res.issues);
          launched.push({ issueNumber: issue.number, threadId });
        }
        return { ok: true, launched };
      },
      "workQueue:startAllReadyGlobal": async (projectId) => {
        const res = await issuesService.list(projectId);
        if (!res.ok) return { ok: false, reason: "error", message: res.reason };
        const ready = res.issues.filter((i) => i.status === "ready" && !i.inProgress);
        const launched: Array<{ issueNumber: number; threadId: string }> = [];
        for (const issue of ready) {
          const threadId = await launchIssueAgent(projectId, issue, res.issues);
          launched.push({ issueNumber: issue.number, threadId });
        }
        return { ok: true, launched };
      },
      // Break a childless PRD into issues via the to-issues skill. Runs on a
      // thread rooted in the project working dir — no worktree, since the
      // skill edits the tracker (gh issue create), not repo files.
      "workQueue:breakdownPrd": async (projectId, prdNumber) => {
        const res = await issuesService.list(projectId);
        if (!res.ok) return { ok: false, reason: "error", message: res.reason };
        const prd = res.issues.find((i) => i.number === prdNumber && i.isPrd);
        if (!prd) return { ok: false, reason: "error", message: "PRD not found" };
        const thread = await threadService.createThread(projectId);
        await applyPinnedProjectPrefs(projectId, thread.id);
        await threadService.prompt(thread.id, buildPrdBreakdownPrompt(prd));
        return { ok: true, threadId: thread.id };
      },
      // Launch an agent directly on a childless PRD: isolated worktree+branch,
      // seeded with the PRD body. The resulting PR closes the PRD issue itself.
      "workQueue:startPrdAgent": async (projectId, prdNumber) => {
        const res = await issuesService.list(projectId);
        if (!res.ok) return { ok: false, reason: "error", message: res.reason };
        const prd = res.issues.find((i) => i.number === prdNumber && i.isPrd);
        if (!prd) return { ok: false, reason: "error", message: "PRD not found" };
        const dir = await gitService.createWorktree(projectId);
        await gitService.branchWorktree(dir, prdBranchName(prd.number, prd.title));
        const wt = appService.addWorktree(projectId, dir, `prd-${prd.number}`);
        const thread = await threadService.createThread(projectId, { worktreeId: wt.id });
        await applyPinnedProjectPrefs(projectId, thread.id);
        const workflow =
          appService.snapshot().projects.find((p) => p.id === projectId)?.mergeWorkflow ?? "pr";
        await threadService.prompt(thread.id, buildPrdAgentPrompt(prd, workflow));
        return { ok: true, threadId: thread.id };
      },
      "workQueue:closeIssue": (projectId, issueNumber, reason) =>
        issuesService.close(projectId, issueNumber, reason),
      "workQueue:reopenIssue": (projectId, issueNumber) =>
        issuesService.reopen(projectId, issueNumber),
      "workQueue:openCount": (projectId) => issuesService.openCount(projectId),
      "workQueue:mergeBatch": async (projectId, issueNumbers) => {
        // Look up the thread (hence the git cwd) for each issue via its worktree
        // record name `issue-<n>`. Issues without a known worktree thread are
        // returned as rebase-phase failures — the caller can still proceed on
        // the rest.
        const snap = appService.snapshot();
        const projectWorktrees = snap.worktrees.filter(
          (w) => w.projectId === projectId && w.archivedAt == null,
        );
        // Issue titles for (re)created PR bodies. Best-effort: a failed fetch
        // falls back to a generic title so the batch still proceeds.
        const issueTitles = new Map<number, string>();
        const listRes = await issuesService.list(projectId);
        if (listRes.ok) for (const i of listRes.issues) issueTitles.set(i.number, i.title);
        const titleFor = (n: number) => issueTitles.get(n) ?? `Issue #${n}`;
        const items: MergeBatchItemResult[] = [];
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
            emit("event:mergeProgress", { projectId, issueNumber, phase: "rebase", done: true, item });
            continue;
          }
          const rebaseRes = await gitService.rebaseAndTest(thread.id);
          if (!rebaseRes.ok) {
            const item = { ok: false as const, issueNumber, phase: rebaseRes.error.includes("Tests") ? ("tests" as const) : ("rebase" as const), error: rebaseRes.error };
            items.push(item);
            emit("event:mergeProgress", { projectId, issueNumber, phase: item.phase, done: true, item });
            // On any rebase-phase failure, nudge the issue's thread to resolve
            // it: the thread is the actor that can fix whatever blocked the
            // rebase — uncommitted changes left in the worktree, a real
            // rebase conflict, a detached HEAD, etc. rebaseAndTest already
            // aborted (on conflict) or refused (on dirty tree), leaving the
            // worktree on the agent's branch, so the agent can commit/stash,
            // re-run the rebase, fix conflicts, push, and stop for the human
            // to re-attempt the merge. Test-phase failures are left alone
            // (a different concern).
            if (item.phase === "rebase") {
              await threadService
                .prompt(
                  thread.id,
                  rebaseFailure(issueNumber, rebaseRes.error),
                )
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
            const mergeRes = await gitService.mergeBranchToDefault(thread.id);
            const item: MergeBatchItemResult = mergeRes.ok
              ? { ok: true, issueNumber, mergedTo: mergeRes.target, tests: rebaseRes.tests }
              : { ok: false, issueNumber, phase: "merge", error: mergeRes.error };
            items.push(item);
            emit("event:mergeProgress", { projectId, issueNumber, phase: "merge", done: true, item });
            if (mergeRes.ok) {
              // No PR means no GitHub `Closes #N` auto-close, so close the
              // issue explicitly — the local-workflow equivalent. Best-effort:
              // a close failure must not undo a merge that already landed.
              await issuesService.close(projectId, issueNumber, "completed").catch((e) =>
                console.error(`[mergeBatch] failed to close issue #${issueNumber}:`, e),
              );
              await appService.archive(wt!.id).catch((e) =>
                console.error(`[mergeBatch] failed to archive worktree ${wt!.id}:`, e),
              );
            } else {
              await threadService
                .prompt(
                  thread.id,
                  localMergeFailure(issueNumber, mergeRes.error),
                )
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
          const ensured = await gitService.ensureOpenPr(
            thread.id,
            issueNumber,
            titleFor(issueNumber),
          );
          const mergeRes = ensured.ok
            ? await gitService.mergePr(thread.id)
            : ensured;
          const item: MergeBatchItemResult = mergeRes.ok
            ? { ok: true, issueNumber, prUrl: mergeRes.prUrl, tests: rebaseRes.tests }
            : { ok: false, issueNumber, phase: "merge", error: mergeRes.error };
          items.push(item);
          emit("event:mergeProgress", { projectId, issueNumber, phase: "merge", done: true, item });
          if (mergeRes.ok) {
            // Pull main locally so the next item in the batch sees a current
            // project repo. Best-effort — a pull failure does not fail the
            // merge that already landed on GitHub.
            await gitService.pull(thread.id).catch(() => undefined);
            // The issue shipped + its PR merged, so the isolated worktree
            // (git checkout + DB record) and its thread are no longer needed.
            // `appService.archive` is the full teardown: archives the worktree
            // record (drops it from the sidebar), archives every live thread
            // in it (drops them from the sidebar), and `git worktree remove`s
            // the checkout dir so the git process is cleaned up too.
            await appService.archive(wt!.id).catch((e) =>
              console.error(`[mergeBatch] failed to archive worktree ${wt!.id}:`, e),
            );
          }
        }
        return { ok: true, items };
      },
      "git:info": gitService.info.bind(gitService),
      "git:changedFiles": gitService.changedFiles.bind(gitService),
      "git:fileDiff": gitService.fileDiff.bind(gitService),
      "git:commitPush": gitService.commitPush.bind(gitService),
      "git:createPr": gitService.createPr.bind(gitService),
      "git:mergePr": gitService.mergePr.bind(gitService),
      // Merge a worktree branch into the local repo. When the target is the
      // repo's default branch and the worktree is linked to a work-queue issue
      // (`issue-<n>`), close that issue — the local-merge equivalent of a PR's
      // `Closes #N`, so the Work Queue reflects "done". Worktree teardown stays
      // the user's choice (the GitWidget Move/Delete buttons).
      "git:mergeToLocal": async (threadId) => {
        const result = await gitService.mergeToLocal(threadId);
        if (!result.ok) return result;
        const info = await gitService.info(threadId);
        if (!info.defaultBranch || result.target !== info.defaultBranch) return result;
        const snap = appService.snapshot();
        const wtId = snap.threads.find((t) => t.id === threadId)?.worktreeId;
        const wt = wtId ? snap.worktrees.find((w) => w.id === wtId) : undefined;
        const issueNumber = wt ? Number(/^issue-(\d+)$/.exec(wt.name)?.[1] ?? NaN) : NaN;
        if (wt && Number.isFinite(issueNumber)) {
          await issuesService.close(wt.projectId, issueNumber, "completed").catch((e) =>
            console.error(`[mergeToLocal] failed to close issue #${issueNumber}:`, e),
          );
        }
        return result;
      },
      "git:pushLocal": gitService.pushLocal.bind(gitService),
      "git:rebaseAndTest": gitService.rebaseAndTest.bind(gitService),
      // remote session hosting (ADR-0009)
      "remote:hostStatus": remoteHost.status.bind(remoteHost),
      "remote:setHostEnabled": remoteHost.setHostEnabled.bind(remoteHost),
      "remote:listTailnetPeers": listTailnetPeersDefault,
      "remote:listHosts": remoteClient.listHosts.bind(remoteClient),
      "remote:addHost": remoteClient.addHost.bind(remoteClient),
      "remote:removeHost": remoteClient.removeHost.bind(remoteClient),
      "remote:listSessions": remoteClient.listSessions.bind(remoteClient),
      "remote:attach": remoteClient.attach.bind(remoteClient),
      "remote:detach": remoteClient.detach.bind(remoteClient),
      "remote:message": remoteClient.message.bind(remoteClient),
      "remote:steer": remoteClient.steer.bind(remoteClient),
      "remote:abort": remoteClient.abort.bind(remoteClient),
      "remote:takeControl": remoteClient.takeControl.bind(remoteClient),
      "remote:releaseControl": remoteClient.releaseControl.bind(remoteClient),
      "remote:archive": remoteClient.archive.bind(remoteClient),
      "remote:pullToTest": remoteClient.pullToTest.bind(remoteClient),
      // Movable execution / remote-first mode (docs/remote-handoff.md).
      "handoff:getMode": handoffService.getMode.bind(handoffService),
      "handoff:setMode": handoffService.setMode.bind(handoffService),
      "handoff:statusForThread": handoffService.statusForThread.bind(handoffService),
      "handoff:registerMachine": handoffService.registerMachine.bind(handoffService),
      "usage:list": usageService.list.bind(usageService),
      "usage:refresh": usageService.refresh.bind(usageService),
      // Provider auth / login (pi auth.json is the source of truth).
      "auth:listProviders": authService.listProviders.bind(authService),
      "auth:loginApiKey": authService.loginApiKey.bind(authService),
      "auth:startOAuthLogin": authService.startOAuthLogin.bind(authService),
      "auth:respondLogin": authService.respondLogin.bind(authService),
      "auth:cancelOAuthLogin": authService.cancelLogin.bind(authService),
      "auth:logout": authService.logout.bind(authService),
    },
    {
      "app:ping": () => ({ pong: true, version: app.getVersion() }),
      "feedback:send": async (body) => {
        // The peach-pi repo is the feedback sink. Token comes from the git
        // credential helper (same source as the issues service), so the
        // user must have authenticated `gh` or `git credential` for
        // github.com on this machine.
        const owner = "pechhe";
        const repo = "peach-pi";
        const token = await githubToken();
        if (!token) {
          return { ok: false, error: "GitHub not authenticated. Run `gh auth login` or configure `git credential` for github.com." };
        }
        const version = app.getVersion();
        const os = `${process.platform}/${process.arch}`;
        const firstLine = body.split("\n").find((l) => l.trim())?.slice(0, 80) || "Feedback";
        const issueBody = `## Feedback\n\n${body}\n\n---\n*peach-pi ${version} · ${os}*`;
        try {
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
            method: "POST",
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": "peach-pi",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: `Feedback: ${firstLine}`, body: issueBody, labels: ["feedback"] }),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            return { ok: false, error: `GitHub API ${res.status}: ${detail.slice(0, 200)}` };
          }
          const json = (await res.json()) as { html_url: string };
          return { ok: true, url: json.html_url };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
      "app:listScopedModels": async () => {
        const { listScopedModels } = await import("@peach-pi/pi-client");
        return listScopedModels();
      },
      "app:listScopedModelsForProject": async (projectId) => {
        const { listScopedModels } = await import("@peach-pi/pi-client");
        const project = appService.snapshot().projects.find((p) => p.id === projectId);
        // Read the scope from the project dir so it matches the TUI / composer
        // (project settings.json overrides global). Falls back to the global
        // read if the project is unknown or has no path.
        return listScopedModels(project?.path);
      },
      "app:setModelScoped": async (provider, modelId, scoped) => {
        const { setModelScoped } = await import("@peach-pi/pi-client");
        const result = await setModelScoped(provider, modelId, scoped);
        // The scope lives in settings.json; reload it into every live pi session
        // so the composer's scoped list reflects the change, then tell the
        // renderer to re-list (it caches once).
        await threadService.reloadScopedModels();
        emit("event:scopeChanged", undefined);
        return result;
      },
      "app:setPiSettings": async (patch) => {
        const updated = await setPiSettings(patch);
        if (patch.insomnia !== undefined) svc.insomniaService.setEnabled(updated.insomnia);
        return updated;
      },
      "app:installVisionProxy": () => installVisionProxy(emit),
      "app:getPiHealth": () => computePiHealth(__dirname),
      "devtap:report": (entry) =>
        emitDevTapEvent({
          level: entry.error ? "error" : "info",
          source: "renderer",
          area: entry.error ? "error" : "diagnostic",
          event: entry.event,
          message: entry.message ?? entry.error?.message,
          payload: entry.payload,
          error: entry.error,
        }),
      "app:openFolder": async (threadId) => {
        const dir = gitService.cwdFor(threadId);
        console.log('[openFolder]', threadId, dir);
        if (dir) {
          const err = await shell.openPath(dir);
          if (err) console.error('[openFolder]', err);
        }
      },
      "worktrees:create": async (projectId) => {
        const dir = await gitService.createWorktree(projectId);
        return appService.addWorktree(projectId, dir);
      },
      "threads:delete": (id) => {
        // Deleting one thread leaves the worktree record + dir intact; teardown
        // happens only when the whole worktree is archived.
        threadService.delete(id);
      },
      "resources:readMarkdown": async (filePath) => (await import("node:fs/promises")).readFile(filePath, "utf8"),
      "agentBrowser:install": () => agentBrowserService.install((channel, payload) => emit(channel, payload)),
      "hud:hide": () => {
        hud.getHudWindow()?.hide();
      },
      "hud:toggle": () => hud.toggleHud(),
      "hud:newChat": async () => {
        const thread = await threadService.createChat();
        appService.setHudThread(thread.id);
        return thread;
      },
      "hud:setExpanded": (expanded) => hud.setHudExpanded(expanded),
      "hud:setClickThrough": (ignore) =>
        hud.getHudWindow()?.setIgnoreMouseEvents(ignore, { forward: true }),
      "hud:releaseFocus": () => hud.getHudWindow()?.blur(),
      "remote:regenerateToken": async () => {
        await remoteHost.regenerateToken();
        return remoteHost.status();
      },
      "remote:setProjectServed": (projectId, served) => {
        remoteHost.setProjectServed(projectId, served);
        void remoteHost.persist();
        emit("event:remoteHostStatus", undefined);
        return remoteHost.status();
      },
      "remote:setServeAll": (serveAll) => {
        remoteHost.setServeAll(serveAll);
        void remoteHost.persist();
        emit("event:remoteHostStatus", undefined);
        return remoteHost.status();
      },
      "remote:connectInfo": async () => {
        const s = await remoteHost.status();
        return getConnectInfo({ token: s.token, relayPort: s.port, enabled: s.enabled });
      },
      "remote:enableServe": async () => {
        const s = await remoteHost.status();
        await enableServe(s.port);
        return getConnectInfo({ token: s.token, relayPort: s.port, enabled: s.enabled });
      },
      "handoff:message": (threadId) =>
        handoffService.ensureRemoteForThread(threadId, "manual handoff"),
      // Auto-dispatch a thread to resolve a pull --rebase conflict (mirrors the
      // mergeBatch rebase-failure nudge). The pull stopped mid-rebase on the
      // agent's branch; serving the thread the same instruction mergeBatch does
      // — commit/stash, re-run the rebase, resolve conflicts, push, test, stop
      // — resolves it without a manual terminal detour. Fire-and-forget; never
      // blocks the pull result returned to GitWidget.
      "git:pull": async (threadId) => {
        const result = await gitService.pull(threadId);
        if (!result.ok && result.conflict) {
          void threadService
            .prompt(
              threadId,
              pullConflict(),
            )
            .catch((e) =>
              console.error(`[git:pull] failed to prompt thread ${threadId} for rebase conflict:`, e),
            );
        }
        return result;
      },
    },
  );
}
