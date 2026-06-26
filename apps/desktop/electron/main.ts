import { app, BrowserWindow, dialog, globalShortcut, Notification, screen, shell } from "electron";
import path from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import {
  PORTABLE_PI_CONFIG_FILES,
  PORTABLE_PI_DIRS,
  type EventChannel,
  type TrackedIssue,
  issueBranchName,
  issueWorktreeName,
  buildSeedPrompt,
} from "@peach-pi/shared-types";
import { openDb } from "./persistence/db.ts";
import { createEmitter, registerIpcHandlers } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
import { ThreadService } from "./services/thread-service.ts";
import { AutomationService } from "./services/automation-service.ts";
import { TerminalService } from "./services/terminal-service.ts";
import { GitService } from "./services/git-service.ts";
import { SubagentService, setupSubagentEnvironment } from "./services/subagent-service.ts";
import { IssuesService } from "./services/issues-service.ts";
import { SideChatService } from "./services/side-chat-service.ts";
import { DevTapInstallService } from "./services/devtap-install-status.ts";
import { getCavemanState, setCavemanEnabled, setCavemanLevel } from "./services/caveman.ts";
import { getPiSettings, setPiSettings } from "./services/pi-settings.ts";
import { InsomniaService } from "./services/insomnia.ts";
import {
  getVisionProxyConfig,
  getVisionProxyInstallState,
  installVisionProxy,
  setVisionProxyMode,
  setVisionProxyModel,
} from "./services/pi-vision-proxy.ts";
import { computePiHealth } from "./services/pi-health.ts";
import { PiUpdateService } from "./services/pi-update-service.ts";
import { emitDevTapEvent, initDevTapMain } from "./services/devtap.ts";
import { Tray, Menu, nativeImage } from "electron";
import { RecordingService } from "./services/recording-service.ts";
import {
  setDevTapStateProvider,
  startDevTapControlChannel,
  stopDevTapControlChannel,
} from "./services/devtap-control.ts";
import { ConnectorService } from "./services/connector-service.ts";
import { BwsService } from "./services/bws-service.ts";
import { CustomConnectionService } from "./services/custom-connection-service.ts";
import { ConnectionSetupService } from "./services/connection-setup-service.ts";
import { McpService } from "./services/mcp-service.ts";
import { CuaDriverService } from "./services/cua-driver-service.ts";
import { AgentBrowserService } from "./services/agent-browser-service.ts";
import { UsageService } from "./services/usage-service.ts";
import { ConnectorResolver } from "./services/connector-resolver.ts";
import { ensureConnectorExtension } from "./services/connector-extension.ts";
import { ensurePeachVisionConsentExtension } from "./services/peach-vision-consent-extension.ts";
import { createMainWindow } from "./windows/main-window.ts";
import {
  createHudWindow,
  HUD_WIDTH,
  HUD_COLLAPSED_HEIGHT,
  HUD_EXPANDED_HEIGHT,
} from "./windows/hud-window.ts";
import { RemoteHostService } from "./services/remote-host.ts";
import { RemoteClientService } from "./services/remote-client.ts";
import { createHandoffService } from "./services/handoff-service.ts";
import { getConnectInfo, enableServe, listTailnetPeers } from "./services/remote-serve.ts";
import { recordCheckpoint, originUrl as originUrlOf } from "./services/remote-checkpoint.ts";

// TEMP DEBUG: enable CDP for renderer layout inspection.
app.commandLine.appendSwitch("remote-debugging-port", "9222");

// Test isolation: override userData before any path use.
if (process.env.PEACH_PI_USER_DATA) {
  app.setPath("userData", process.env.PEACH_PI_USER_DATA);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Recursively list files under `root` (paths relative to `root`, posix
 *  slashes), skipping node_modules/.cache/lockfiles so each machine keeps its
 *  own regenerable install state. Used by the pi-config pull (ADR-0011) to
 *  blind-overwrite the extensions/ + skills/ trees. */
async function collectTreeFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // missing dir on this machine: nothing to serve
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".cache") continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.name === "package-lock.json") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, rel);
      else out.push(rel);
    }
  }
  await walk(root, "");
  return out;
}

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

/**
 * Save a skill's markdown to a user-chosen destination. Reads the source skill
 * file and writes its contents to the picked path. Returns null on cancel or error.
 */
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

// Boot sequence only. Feature logic lives in services.
// Single-instance lock keeps end users from spawning duplicates. Opt out via
// PEACH_PI_ALLOW_MULTI_INSTANCE=1 so a dev build can run alongside a packaged
// build (or vice versa) for side-by-side testing.
if (process.env.PEACH_PI_ALLOW_MULTI_INSTANCE === "1") {
  void boot();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void boot();
}

async function boot(): Promise<void> {
  initDevTapMain();
  await app.whenReady();
  emitDevTapEvent({ area: "lifecycle", event: "app.ready" });

  const db = openDb(path.join(app.getPath("userData"), "peach-pi.sqlite"));
  const emit = createEmitter(() => BrowserWindow.getAllWindows());
  const appService = new AppService(db, emit);
  // Movable execution / remote-first mode (docs/remote-handoff.md). Distinct
  // from the ADR-0009 RemoteHostService below; shares the same kv db handle.
  // The service declares a loose Emit shape (channel: string, payload: unknown)
  // so it loads in plain Node for unit tests; adapt the typed emitter here.
  const handoffEmit = ((channel: string, payload: unknown) =>
    emit(channel as EventChannel, payload as never)) as
    Parameters<typeof createHandoffService>[1];
  const handoffService = createHandoffService(db, handoffEmit);
  setDevTapStateProvider(() => ({ app: appService.snapshot() }));
  let mainWindow: BrowserWindow | null = null;
  let hudWindow: BrowserWindow | null = null;
  let hudExpanded = false;

  const isHudUp = () =>
    !!hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible();

  const threadService = new ThreadService(
    db,
    emit,
    () => emit("event:snapshot", appService.snapshot()),
    path.join(app.getPath("userData"), "chats"),
    (thread) => {
      // HUD up → route to the HUD as an ambient cue instead of a system
      // notification (the renderer decides pulse/expand/badge via routeFinishCue).
      if (isHudUp()) {
        emit("event:hudFinish", { threadId: thread.id });
        return;
      }
      // Run finished while the app is in the background → notify (Phase 6).
      if (BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return;
      const note = new Notification({
        title: thread.title || "Thread finished",
        body: "Run complete — click to open.",
        silent: true, // app has its own done sound
      });
      note.on("click", () => {
        if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        emit("event:focusThread", thread.id);
      });
      note.show();
    },
    () => appService.getUtilityModel(),
    () => appService.getAutoCompact(),
    (running) => {
      if (running) insomniaService.onRunStart();
      else {
        insomniaService.onRunEnd();
        // Flush any update queued while runs were active. Safe to call even
        // when no update is queued; piUpdateService re-checks hasActiveRuns.
        piUpdateService.onRunsIdle();
      }
    },
  );
  const automationService = new AutomationService(
    db,
    threadService,
    () => emit("event:snapshot", appService.snapshot()),
    // Fires after start(), by which point gitService is initialized below.
    async (projectId) => {
      const dir = await gitService.createWorktree(projectId);
      const wt = appService.addWorktree(projectId, dir);
      return { worktreeId: wt.id, worktreeDir: wt.dir };
    },
  );
  const terminalService = new TerminalService(db, emit);
  const recordingService = new RecordingService(emit);
  recordingService.setPrompter((threadId, text) =>
    threadService.prompt(threadId, text, [], "all"),
  );
  const gitService = new GitService(
    db,
    path.join(app.getPath("userData"), "worktrees"),
    () => appService.getUtilityModel(),
  );
  threadService.setGitService(gitService);
  // Sink the `threads:create` + `threads:setEnvironment` orchestrators into
  // ThreadService (issue #15). App↔Thread cycle → injected post-construction.
  threadService.initAppCollaborator(appService);
  // Sink the `worktrees:archive` orchestrator into AppService (issue #15).
  appService.setTeardownCollaborators({
    threadService,
    gitService,
  });
  // Lift a conversation thread into a remote work unit before each prompt when
  // remote-first mode is on (returns a status note; the hook swallows errors).
  threadService.setHandoffService({
    beforePrompt: async (threadId, task) => {
      const before = await handoffService.statusForThread(threadId);
      const after = await handoffService.ensureRemoteForThread(threadId, task);
      if (before.owner !== after.owner && after.owner === "remote") {
        return `handed off to ${after.remoteMachine ?? "remote"}`;
      }
      return null;
    },
  });

  // Remote session hosting (ADR-0009). The master relay taps the same
  // transcript flush the renderer gets; checkpoints fire on run-idle. Both
  // are off until a thread is served / a host is attached.
  const remoteHost: RemoteHostService = new RemoteHostService({
    transcript: (threadId) => threadService.getTranscript(threadId),
    threads: () =>
      appService.snapshot().threads.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        projectId: t.projectId,
        archivedAt: t.archivedAt,
      })),
    threadCwd: (threadId) => gitService.cwdFor(threadId),
    projects: () =>
      appService
        .snapshot()
        .projects.filter((p) => !p.archivedAt)
        .map((p) => ({ id: p.id, name: p.name })),
    settings: async () => ({
      piSettings: await getPiSettings(),
      autoCompact: appService.getAutoCompact(),
      utilityModel: appService.getUtilityModel(),
    }),
    piConfig: async () => {
      const dir = path.join(homedir(), ".pi", "agent");
      const out: Record<string, string | null> = {};
      // Flat allowlisted files (models/auth/settings/.../package.json — the
      // extension enable list lives here).
      for (const name of PORTABLE_PI_CONFIG_FILES) {
        try {
          out[name] = await readFile(path.join(dir, name), "utf8");
        } catch {
          out[name] = null;
        }
      }
      // Directory trees (ADR-0011): extensions + skills, so the per-skill
      // `disable-model-invocation` frontmatter (system-prompt injection
      // on/off) carries over. Skip node_modules/.cache/lockfiles — each
      // machine regenerates those locally.
      for (const sub of PORTABLE_PI_DIRS) {
        const root = path.join(dir, sub);
        const files = await collectTreeFiles(root);
        for (const rel of files) out[`${sub}/${rel}`] = await readFile(path.join(root, rel), "utf8");
      }
      return out;
    },
    // Steer-back verbs (ADR-0010): thin forwarders to the same services the
    // desktop renderer drives. `message` mirrors the desktop composer's plain
    // send — prompt when idle, follow-up queue while running.
    actions: {
      message: (threadId, text) => threadService.prompt(threadId, text),
      steer: (threadId, text) => threadService.steer(threadId, text),
      abort: (threadId) => threadService.abort(threadId),
      archiveThread: (threadId) => {
        threadService.archive(threadId);
        return Promise.resolve();
      },
      deleteQueued: (threadId, kind, index) =>
        kind === "steer"
          ? threadService.deleteSteer(threadId, index)
          : threadService.deleteFollowUp(threadId, index),
      createThread: async (projectId) => (await threadService.createThread(projectId)).id,
      createChat: async () => (await threadService.createChat()).id,
      gitCommitPush: (threadId, message) => gitService.commitPush(threadId, message),
      gitPr: (threadId) => gitService.createPr(threadId),
      gitMerge: (threadId) => gitService.mergeToLocal(threadId),
    },
  });
  void remoteHost.load();
  // Sink the `remote:setHostEnabled` orchestrator into RemoteHostService
  // (issue #15). Inject the Tailscale-Serve fronting hook + status-change
  // notifier so the relay stays free of the tailscale CLI + typed-Emit coupling.
  remoteHost.setHostHooks({
    enableServe,
    onStatusChange: () => emit("event:remoteHostStatus", undefined),
  });
  // RemoteHostService is a registered subscriber to ThreadService's frame
  // stream (ADR-0009's second subscriber). The callback builds the SSE-wire
  // RemoteTapFrames from the in-process ThreadFrames — the relay stays a thin
  // forwarder; adding a DevTap or recording tap is now one subscribe() call,
  // with no edits to the emission paths. (#14)
  threadService.subscribe((frame) => {
    switch (frame.kind) {
      case "transcript":
        remoteHost.forwardTranscript(frame);
        break;
      case "status":
        remoteHost.forwardStatus(frame.threadId, frame.status);
        break;
      case "queue":
        remoteHost.forwardQueue(frame.threadId, frame.steering, frame.followUp);
        break;
      case "idle": {
        // Only checkpoint when remote hosting is actually running. Being "served"
        // is config intent, not an active host — without isActive() a leftover
        // serveAll=true force-pushes wip/<id> branches while hosting is off.
        const { threadId, cwd } = frame;
        if (!cwd || !remoteHost.isActive() || !remoteHost.isServedThread(threadId)) return;
        void recordCheckpoint(cwd, threadId).then((ckpt) => {
          if (ckpt) remoteHost.forwardCheckpoint(threadId, ckpt.sha);
        });
        break;
      }
    }
  });
  const remoteClient = new RemoteClientService(
    emit,
    async (origin) => {
      for (const p of appService.snapshot().projects) {
        if ((await originUrlOf(p.path)) === origin) return p.path;
      }
      return null;
    },
    path.join(app.getPath("userData"), "worktrees"),
  );
  // Fold remote-master threads into the app snapshot so they render in the
  // normal sidebar (tagged remote); republish whenever the poll refreshes them.
  appService.setRemoteThreadsProvider(() => remoteClient.remoteThreadsSnapshot());
  remoteClient.onChange = () => emit("event:snapshot", appService.snapshot());
  // One-time settings pull on connect (ADR-0011): adopt the master's behavioral
  // settings into this client, with a guard so the utility model is only
  // applied if its provider resolves on this machine.
  remoteClient.applySettings = async (settings) => {
    await setPiSettings(settings.piSettings);
    appService.setAutoCompact(settings.autoCompact);
    if (settings.utilityModel) {
      try {
        const known = (await import("@peach-pi/pi-client").then((m) => m.listAvailableModels()))
          .map((m) => `${m.provider}:${m.id}`);
        if (known.includes(`${settings.utilityModel.provider}:${settings.utilityModel.id}`)) {
          appService.setUtilityModel(settings.utilityModel);
        }
      } catch {
        // Model list unreadable — leave the local utility model untouched.
      }
    }
    emit("event:snapshot", appService.snapshot());
  };
  // Overwrite the allowlisted ~/.pi/agent files from the master (ADR-0011).
  remoteClient.applyPiConfig = async (payload) => {
    const dir = path.join(homedir(), ".pi", "agent");
    await mkdir(dir, { recursive: true });
    for (const [name, contents] of Object.entries(payload)) {
      if (contents == null) continue;
      const dest = path.join(dir, name);
      // Blind-overwrite flat files + the synced skills//extensions/ trees
      // (ADR-0011). `name` may carry subdirs (e.g. `skills/foo/SKILL.md`),
      // so create the parent first. */
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, contents, "utf8");
    }
  };
  void remoteClient.load().then(() => remoteClient.ensurePolling());
  // Attribute steering leases + archive actions to this machine (ADR-0011).
  remoteClient.clientIdentity = () => appService.getRemoteClientId();

  const subagentService = new SubagentService(db);
  const sideChatService = new SideChatService(db, emit, threadService, gitService);
  const devTapInstallService = new DevTapInstallService(db);
  // Work queue (issue #17): per-project tracker issues from the project's
  // GitHub origin. getWorktreeNames feeds in-progress detection (a worktree
  // named issue-<n> means that issue is already being worked).
  const issuesService = new IssuesService(
    (id) => appService.snapshot().projects.find((p) => p.id === id)?.path ?? null,
    (id) =>
      appService.snapshot().worktrees
        .filter((w) => w.projectId === id && w.archivedAt == null)
        .map((w) => w.name),
  );
  const piUpdateService = new PiUpdateService(db, emit, () =>
    appService.snapshot().threads.some((t) => t.status === "running"),
    () => appService.snapshot().projects.map((p) => p.path),
    () => void threadService.reloadIdleSessions(),
  );
  setupSubagentEnvironment(app.getPath("userData"));

  const insomniaService = new InsomniaService();
  void getPiSettings().then((s) => insomniaService.setEnabled(s.insomnia));

  const connectorService = new ConnectorService(emit);
  const bwsService = new BwsService(emit);
  const customConnectionService = new CustomConnectionService(emit);
  const connectionSetupService = new ConnectionSetupService(
    emit,
    () => appService.getUtilityModel(),
    customConnectionService,
  );
  const mcpService = new McpService();
  const cuaDriverService = new CuaDriverService();
  const agentBrowserService = new AgentBrowserService();
  const usageService = new UsageService(emit);
  // Install CuaDriver.app + start its background daemon + install the agent
  // skill + install the cua-driver toolset extension. Best-effort; never
  // blocks boot (see ADR-0007).
  void cuaDriverService.init();
  // Ensure the pi-agent-browser-native package is installed so pi exposes the
  // native `agent_browser` tool (ADR-0008). Idempotent; background; never
  // blocks boot.
  void (async () => {
    if (!(await agentBrowserService.state()).installed) {
      await agentBrowserService.install((channel, payload) => emit(channel, payload));
    }
  })();

  // Localhost bridge so a pi extension (in the terminal, no IPC access) can
  // reach Composio through the main process. Started after ready; stopped on quit.
  const connectorResolver = new ConnectorResolver(connectorService, customConnectionService, bwsService);
  void connectorResolver.start().then(() => connectorResolver.writeBootstrap());
  // Write the pi extension (auto-discovered by pi) so the agent gets the
  // connectors_search_tools / connector_execute tools. Idempotent; rewrites on bump.
  void ensureConnectorExtension();
  // Make the pi-vision-proxy data-egress consent prompt fire at most once
  // per 24h per provider (peach-owned extension; survives vision-proxy
  // reinstalls/upgrades). Idempotent; rewrites on bump.
  void ensurePeachVisionConsentExtension();

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
    const parentPrd =
      issue.parent != null
        ? (allIssues.find((i) => i.number === issue.parent && i.isPrd) ?? null)
        : null;
    await threadService.prompt(thread.id, buildSeedPrompt(issue, parentPrd));
    return thread.id;
  }

  // Declarative pass-throughs: channel → bound method / bare function. The
  // registry loop registers these exactly like a normal handler; no wrapping
  // lambda, so signature == implementation (ADR-0009 typed registry unchanged).
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
      "app:updateExtensions": piUpdateService.updateNow.bind(piUpdateService),
      "extensions:remove": piUpdateService.removeExtension.bind(piUpdateService),
      "extensions:deleteLocal": piUpdateService.deleteLocalExtension.bind(piUpdateService),
      "skills:delete": piUpdateService.deleteSkill.bind(piUpdateService),
      "skills:setInvocation": piUpdateService.setSkillInvocation.bind(piUpdateService),
      "extensions:setEnabled": piUpdateService.setEnabledExtension.bind(piUpdateService),
      "mcp:setEnabled": mcpService.setEnabled.bind(mcpService),
      "mcp:list": mcpService.list.bind(mcpService),
      "connectors:catalogue": connectorService.catalogue.bind(connectorService),
      "connectors:toolkit": connectorService.toolkit.bind(connectorService),
      "connectors:list": connectorService.list.bind(connectorService),
      "connectors:connectFields": connectorService.connectFields.bind(connectorService),
      "connectors:disconnect": connectorService.disconnect.bind(connectorService),
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
      "customConnections:list": customConnectionService.list.bind(customConnectionService),
      "customConnections:create": customConnectionService.create.bind(customConnectionService),
      "customConnections:delete": customConnectionService.delete.bind(customConnectionService),
      "connectionSetup:start": connectionSetupService.start.bind(connectionSetupService),
      "connectionSetup:send": connectionSetupService.send.bind(connectionSetupService),
      "connectionSetup:save": connectionSetupService.save.bind(connectionSetupService),
      "connectionSetup:close": connectionSetupService.close.bind(connectionSetupService),
      "cuaDriver:status": cuaDriverService.status.bind(cuaDriverService),
      "cuaDriver:grantPermissions": cuaDriverService.grantPermissions.bind(cuaDriverService),
      "agentBrowser:state": agentBrowserService.state.bind(agentBrowserService),
      "ui:setSidebarWidth": appService.setSidebarWidth.bind(appService),
      "ui:setSidebarCollapsed": appService.setSidebarCollapsed.bind(appService),
      "projects:add": appService.addProject.bind(appService),
      "projects:remove": appService.removeProject.bind(appService),
      "projects:pick": pickProject,
      "projects:reorder": appService.reorderProjects.bind(appService),
      "projects:setCollapsed": appService.setProjectCollapsed.bind(appService),
      "worktrees:rename": appService.renameWorktree.bind(appService),
      "worktrees:archive": appService.archive.bind(appService),
      "threads:create": threadService.createThread.bind(threadService),
      "threads:createChat": threadService.createChat.bind(threadService),
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
      "devtap:projectStatus": devTapInstallService.status.bind(devTapInstallService),
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
      "workQueue:closeIssue": (projectId, issueNumber, reason) =>
        issuesService.close(projectId, issueNumber, reason),
      "workQueue:reopenIssue": (projectId, issueNumber) =>
        issuesService.reopen(projectId, issueNumber),
      "git:info": gitService.info.bind(gitService),
      "git:changedFiles": gitService.changedFiles.bind(gitService),
      "git:fileDiff": gitService.fileDiff.bind(gitService),
      "git:commitPush": gitService.commitPush.bind(gitService),
      "git:createPr": gitService.createPr.bind(gitService),
      "git:mergePr": gitService.mergePr.bind(gitService),
      "git:mergeToLocal": gitService.mergeToLocal.bind(gitService),
      "git:pushLocal": gitService.pushLocal.bind(gitService),
      // remote session hosting (ADR-0009)
      "remote:hostStatus": remoteHost.status.bind(remoteHost),
      "remote:setHostEnabled": remoteHost.setHostEnabled.bind(remoteHost),
      "remote:listTailnetPeers": listTailnetPeers,
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
    },
    {
      "app:ping": () => ({ pong: true, version: app.getVersion() }),
      "app:listScopedModels": async () => {
        const { listScopedModels } = await import("@peach-pi/pi-client");
        return listScopedModels();
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
        if (patch.insomnia !== undefined) insomniaService.setEnabled(updated.insomnia);
        return updated;
      },
      "app:installVisionProxy": () => installVisionProxy(emit),
      "app:getPiHealth": () => computePiHealth(__dirname),
      "connectors:connect": async (slug) => {
        const r = await connectorService.connect(slug);
        if (r.redirectUrl) void shell.openExternal(r.redirectUrl);
        return r;
      },
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
        hudWindow?.hide();
      },
      "hud:toggle": () => toggleHud(),
      "hud:newChat": async () => {
        const thread = await threadService.createChat();
        appService.setHudThread(thread.id);
        return thread;
      },
      "hud:setExpanded": (expanded) => setHudExpanded(expanded),
      "hud:setClickThrough": (ignore) =>
        hudWindow?.setIgnoreMouseEvents(ignore, { forward: true }),
      "hud:releaseFocus": () => hudWindow?.blur(),
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
    },
  );

  // Persistent floating HUD (CONTEXT.md, ADR-0002). ⌘⇧Space toggles.
  async function toggleHud(): Promise<void> {
    if (!hudWindow || hudWindow.isDestroyed()) {
      const geom = await hudGeometry();
      hudWindow = createHudWindow(geom);
      hudExpanded = false;
      void ensureHudThread();
      // The HUD takes over: hide the rest of the app for a seamless transition.
      hudWindow.once("ready-to-show", () => {
        hudWindow?.show();
        mainWindow?.hide();
      });
      return;
    }
    if (hudWindow.isVisible()) {
      hudWindow.hide();
      showMainWindow();
    } else {
      void ensureHudThread();
      await repositionHud();
      hudWindow.show();
      hudWindow.focus();
      mainWindow?.hide();
    }
  }

  // The HUD always renders the real Composer, which needs a thread: seed from the
  // Main Window selection, else start a fresh chat.
  async function ensureHudThread(): Promise<void> {
    if (appService.seedHudThread()) return;
    const thread = await threadService.createChat();
    appService.setHudThread(thread.id);
  }

  // Measure the Main Window's real composer device (screen coords) so the HUD
  // can match its exact width and position — the composer "stays where it is".
  async function measureComposerRect(): Promise<
    { x: number; y: number; width: number; bottom: number } | null
  > {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
      const r = (await mainWindow.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('footer.composer-device');
          if (!el) return null; const b = el.getBoundingClientRect();
          return { left: b.left, top: b.top, width: b.width, height: b.height }; })()`,
      )) as { left: number; top: number; width: number; height: number } | null;
      if (!r) return null;
      const c = mainWindow.getContentBounds();
      return { x: c.x + r.left, y: c.y + r.top, width: r.width, bottom: c.y + r.top + r.height };
    } catch {
      return null;
    }
  }

  // Where + how wide the HUD opens. When the composer is on screen the HUD
  // follows it exactly (seamless) regardless of window state (default/fullscreen)
  // The HUD always opens centred on the active screen, anchored to the bottom
  // with the same margin as in-app (the composer's own pb-6 sits inside the
  // window) — regardless of where it was last. Width still matches the real
  // composer when one is on screen.
  async function hudGeometry(): Promise<{ x: number; y: number; width: number }> {
    const rect = await measureComposerRect();
    const width = rect?.width ?? HUD_WIDTH;
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    return {
      x: Math.round(wa.x + (wa.width - width) / 2),
      y: wa.y + wa.height - HUD_COLLAPSED_HEIGHT,
      width,
    };
  }

  // Re-centre an existing HUD on re-show, keeping its bottom edge stable.
  async function repositionHud(): Promise<void> {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    const geom = await hudGeometry();
    const [, h = HUD_COLLAPSED_HEIGHT] = hudWindow.getSize();
    hudWindow.setBounds({
      x: geom.x,
      y: geom.y + HUD_COLLAPSED_HEIGHT - h,
      width: Math.round(geom.width),
      height: h,
    });
  }

  function showMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  // Expand/collapse the chat: grow the window upward, composer anchored at bottom.
  function setHudExpanded(expanded: boolean): void {
    if (!hudWindow || hudWindow.isDestroyed() || hudExpanded === expanded) return;
    hudExpanded = expanded;
    const [x = 0, y = 0] = hudWindow.getPosition();
    const [, h = HUD_COLLAPSED_HEIGHT] = hudWindow.getSize();
    const [w = HUD_WIDTH] = hudWindow.getSize();
    const bottom = y + h;
    const height = expanded ? HUD_EXPANDED_HEIGHT : HUD_COLLAPSED_HEIGHT;
    hudWindow.setBounds({ x, y: bottom - height, width: w, height });
  }
  // Startup compatibility check: surface bundled-pi ↔ extension drift early so
  // it shows up in logs even before the renderer queries it for the banner.
  void computePiHealth(__dirname).then((health) => {
    if (health.status === "ok") return;
    console.warn(`[pi-health] ${health.status}: app bundles pi ${health.hostVersion}`);
    for (const problem of health.problems) console.warn(`[pi-health]  - ${problem}`);
  });

  appService.start();
  automationService.start();
  piUpdateService.start();
  mainWindow = createMainWindow();
  startDevTapControlChannel();
  globalShortcut.register("CommandOrControl+Shift+Space", toggleHud);

  // Record & Replay tray — always-available Start/Stop/Cancel + live status.
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon-1024.png"));
  if (!trayIcon.isEmpty()) trayIcon.resize({ width: 20, height: 20 });
  const tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setTitle("REC");
  recordingService.attachTray(tray);

  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });

  app.on("window-all-closed", () => {
    // macOS convention: stay alive.
  });

  app.on("before-quit", () => {
    emitDevTapEvent({ area: "lifecycle", event: "app.before-quit" });
    stopDevTapControlChannel();
    globalShortcut.unregisterAll();
    appService.stop();
    automationService.stop();
    piUpdateService.stop();
    terminalService.dispose();
    recordingService.dispose();
    tray?.destroy();
    void connectorResolver.stop();
    threadService.dispose();
    remoteClient.detach();
    void remoteHost.stop();
    insomniaService.dispose();
    db.close();
  });
}
