import { app, BrowserWindow, dialog, globalShortcut, Notification, screen, shell } from "electron";
import path from "node:path";
import { openDb } from "./persistence/db.ts";
import { createEmitter, registerIpcHandlers } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
import { ThreadService } from "./services/thread-service.ts";
import { AutomationService } from "./services/automation-service.ts";
import { TerminalService } from "./services/terminal-service.ts";
import { GitService } from "./services/git-service.ts";
import { SubagentService, setupSubagentEnvironment } from "./services/subagent-service.ts";
import { GraphifyService } from "./services/graphify-service.ts";
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
import { ensureCuaDriverExtension } from "./services/cua-driver-extension.ts";
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
if (!app.requestSingleInstanceLock()) {
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
      else insomniaService.onRunEnd();
    },
  );
  const automationService = new AutomationService(db, threadService, () =>
    emit("event:snapshot", appService.snapshot()),
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
  });
  void remoteHost.load();
  threadService.setRemoteTap({
    onTranscriptDelta: (delta) => remoteHost.forwardTranscript(delta),
    onRunIdleWithCwd: async (threadId, cwd) => {
      if (!cwd || !remoteHost.isServedThread(threadId)) return;
      const ckpt = await recordCheckpoint(cwd, threadId);
      if (ckpt) remoteHost.forwardCheckpoint(threadId, ckpt.sha);
    },
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
  void remoteClient.load();

  const subagentService = new SubagentService(db);
  const graphifyService = new GraphifyService(db);
  const sideChatService = new SideChatService(db, emit, threadService, gitService);
  const devTapInstallService = new DevTapInstallService(db);
  const piUpdateService = new PiUpdateService(db, emit, () =>
    appService.snapshot().threads.some((t) => t.status === "running"),
    () => appService.snapshot().projects.map((p) => p.path),
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
  // skill. Best-effort; never blocks boot (see ADR-0007).
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
  // Install the cua-driver toolset extension (cua_driver_* tools driving the
  // bundled native driver — ADR-0007). Idempotent; rewrites on bump.
  void ensureCuaDriverExtension();
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

  registerIpcHandlers({
    "app:getSnapshot": () => appService.snapshot(),
    "app:ping": () => ({ pong: true, version: app.getVersion() }),
    "app:setSelectedThread": (id) => appService.setSelectedThread(id),
    "app:getCavemanState": () => getCavemanState(),
    "app:setCavemanEnabled": (enabled) => setCavemanEnabled(enabled),
    "app:setCavemanLevel": (level) => setCavemanLevel(level),
    "app:listModels": () => appService.listModels(),
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
    "app:getUtilityModel": () => appService.getUtilityModel(),
    "app:setUtilityModel": (model) => appService.setUtilityModel(model),
    "app:getAutoCompact": () => appService.getAutoCompact(),
    "app:setAutoCompact": (settings) => appService.setAutoCompact(settings),
    "app:getPiSettings": () => getPiSettings(),
    "app:setPiSettings": async (patch) => {
      const updated = await setPiSettings(patch);
      if (patch.insomnia !== undefined) insomniaService.setEnabled(updated.insomnia);
      return updated;
    },
    "app:getVisionProxyInstallState": () => getVisionProxyInstallState(),
    "app:installVisionProxy": () => installVisionProxy(emit),
    "app:getVisionProxyConfig": () => getVisionProxyConfig(),
    "app:setVisionProxyModel": (model) => setVisionProxyModel(model),
    "app:setVisionProxyMode": (mode) => setVisionProxyMode(mode),
    "app:updateExtensions": () => piUpdateService.updateNow(),
    "extensions:remove": (spec) => piUpdateService.removeExtension(spec),
    "extensions:deleteLocal": (p) => piUpdateService.deleteLocalExtension(p),
    "skills:delete": (p) => piUpdateService.deleteSkill(p),
    "app:getPiHealth": () => computePiHealth(__dirname),
    "connectors:catalogue": (query) => connectorService.catalogue(query),
    "connectors:toolkit": (slug) => connectorService.toolkit(slug),
    "connectors:list": () => connectorService.list(),
    "connectors:connect": async (slug) => {
      const r = await connectorService.connect(slug);
      if (r.redirectUrl) void shell.openExternal(r.redirectUrl);
      return r;
    },
    "connectors:connectFields": (slug, fields) => connectorService.connectFields(slug, fields),
    "connectors:disconnect": (id) => connectorService.disconnect(id),
    "bws:status": () => bwsService.status(),
    "bws:setAccessToken": (token) => bwsService.setAccessToken(token),
    "bws:clearAuth": () => bwsService.clearAuth(),
    "bws:setProject": (projectId) => bwsService.setProject(projectId),
    "bws:install": () => bwsService.install(),
    "bws:listProjects": () => bwsService.listProjects(),
    "bws:listSecrets": (projectId) => bwsService.listSecrets(projectId),
    "bws:createSecret": (input) => bwsService.createSecret(input),
    "bws:editSecret": (secretId, patch) => bwsService.editSecret(secretId, patch),
    "bws:deleteSecret": (secretId) => bwsService.deleteSecret(secretId),
    "customConnections:list": () => customConnectionService.list(),
    "mcp:list": () => mcpService.list(),
    "cuaDriver:status": () => cuaDriverService.status(),
    "cuaDriver:grantPermissions": () => cuaDriverService.grantPermissions(),
    "agentBrowser:state": () => agentBrowserService.state(),
    "agentBrowser:install": () => agentBrowserService.install((channel, payload) => emit(channel, payload)),
    "customConnections:create": (input) => customConnectionService.create(input),
    "customConnections:delete": (id) => customConnectionService.delete(id),
    "connectionSetup:start": (input) => connectionSetupService.start(input),
    "connectionSetup:send": (sessionId, text) => connectionSetupService.send(sessionId, text),
    "connectionSetup:save": (sessionId, config) => connectionSetupService.save(sessionId, config),
    "connectionSetup:close": (sessionId) => connectionSetupService.close(sessionId),
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
    "ui:setSidebarWidth": (width) => appService.setSidebarWidth(width),
    "projects:add": (p) => appService.addProject(p),
    "projects:remove": (id) => appService.removeProject(id),
    "projects:pick": () => pickProject(),
    "projects:reorder": (orderedIds) => appService.reorderProjects(orderedIds),
    "projects:setCollapsed": (projectId, collapsed) =>
      appService.setProjectCollapsed(projectId, collapsed),
    "worktrees:create": async (projectId) => {
      const dir = await gitService.createWorktree(projectId);
      return appService.addWorktree(projectId, dir);
    },
    "worktrees:rename": (worktreeId, name) => {
      appService.renameWorktree(worktreeId, name);
    },
    "worktrees:archive": async (worktreeId) => {
      const wt = appService.worktree(worktreeId);
      if (!wt) return;
      const project = appService.snapshot().projects.find((p) => p.id === wt.projectId);
      const threadIds = appService.archiveWorktree(worktreeId);
      for (const tid of threadIds) threadService.archive(tid);
      if (project) await gitService.removeWorktree(project.path, wt.dir);
    },
    "threads:create": async (projectId, opts) => {
      let worktreeId: string | null = null;
      let worktreeDir: string | undefined;
      if (opts?.worktreeId) {
        const wt = appService.worktree(opts.worktreeId);
        if (!wt) throw new Error(`Unknown worktree: ${opts.worktreeId}`);
        worktreeId = wt.id;
        worktreeDir = wt.dir;
      } else if (opts?.worktree) {
        // Legacy one-shot: create a worktree record + git checkout together.
        const dir = await gitService.createWorktree(projectId);
        const wt = appService.addWorktree(projectId, dir);
        worktreeId = wt.id;
        worktreeDir = wt.dir;
      }
      return threadService.createThread(projectId, worktreeId, worktreeDir);
    },
    "threads:createChat": () => threadService.createChat(),
    "threads:prompt": (id, text, images, toolMode) =>
      threadService.prompt(id, text, images, toolMode),
    "threads:runCommand": (id, command) => threadService.runCommand(id, command),
    "threads:listCommands": (id) => threadService.listCommands(id),
    "threads:search": (query) => threadService.searchThreads(query),
    "threads:listModels": (id) => threadService.listModels(id),
    "threads:listAllModels": (id) => threadService.listAllModels(id),
    "threads:setModelScoped": (id, provider, modelId, scoped) =>
      threadService.setModelScoped(id, provider, modelId, scoped),
    "threads:setModel": (id, provider, modelId) => threadService.setModel(id, provider, modelId),
    "threads:setThinking": (id, level) => threadService.setThinking(id, level),
    "threads:getMeta": (id) => threadService.getMeta(id),
    "threads:respondExtensionUi": (requestId, value) =>
      threadService.respondExtensionUi(requestId, value),
    "threads:terminalCustomInput": (id, requestId, data) =>
      threadService.terminalCustomInput(id, requestId, data),
    "threads:terminalCustomCancel": (id, requestId) =>
      threadService.terminalCustomCancel(id, requestId),
    "threads:compact": (id) => threadService.compact(id),
    "side:start": (threadId, modelOverride) => sideChatService.start(threadId, modelOverride),
    "side:ask": (convId, question) => sideChatService.ask(convId, question),
    "side:list": (threadId) => sideChatService.list(threadId),
    "side:get": (convId) => sideChatService.get(convId),
    "side:delete": (convId) => sideChatService.delete(convId),
    "threads:listTurns": (id) => threadService.listTurns(id),
    "threads:rewind": (id, entryId, revertFiles) => threadService.rewind(id, entryId, revertFiles),
    "automations:create": (fields) => automationService.create(fields),
    "automations:setEnabled": (id, enabled) => automationService.setEnabled(id, enabled),
    "automations:delete": (id) => automationService.delete(id),
    "automations:runNow": (id) => automationService.runNow(id),
    "automations:runs": (id) => automationService.runs(id),
    "automations:previewNext": (cron) => automationService.previewNext(cron),
    "hud:hide": () => {
      hudWindow?.hide();
    },
    "hud:toggle": () => toggleHud(),
    "hud:setThread": (threadId) => appService.setHudThread(threadId),
    "hud:newChat": async () => {
      const thread = await threadService.createChat();
      appService.setHudThread(thread.id);
      return thread;
    },
    "hud:setExpanded": (expanded) => setHudExpanded(expanded),
    "hud:setClickThrough": (ignore) =>
      hudWindow?.setIgnoreMouseEvents(ignore, { forward: true }),
    "hud:releaseFocus": () => hudWindow?.blur(),
    "hud:setAutoReveal": (on) => appService.setHudAutoReveal(on),
    "terminal:open": (id) => terminalService.open(id),
    "terminal:input": (id, data) => terminalService.input(id, data),
    "terminal:resize": (id, cols, rows) => terminalService.resize(id, cols, rows),
    "terminal:kill": (id) => terminalService.kill(id),
    "recording:start": (threadId) => recordingService.start(threadId),
    "recording:stop": (skillBody) => recordingService.stop(skillBody),
    "recording:cancel": () => recordingService.cancel(),
    "recording:status": () => recordingService.status(),
    "recording:revealSkill": (p) => recordingService.revealSkill(p),
    "resources:inspect": (projectId) => threadService.inspectResources(projectId),
    "resources:inspectSlotCommand": (projectId, kind, name) =>
      threadService.inspectSlotCommand(projectId, kind, name),
    "resources:readMarkdown": async (filePath) => (await import("node:fs/promises")).readFile(filePath, "utf8"),
    "skills:save": (skillName, filePath) => saveSkillFile(skillName, filePath),
    "files:readImage": (filePath) => readImageFile(filePath),
    "threads:archive": (id) => threadService.archive(id),
    "threads:unarchive": (id) => threadService.unarchive(id),
    "threads:delete": (id) => {
      // Deleting one thread leaves the worktree record + dir intact; teardown
      // happens only when the whole worktree is archived.
      threadService.delete(id);
    },
    "threads:bringToLocal": async (id) => {
      // Detach the thread back to the project checkout. The worktree record
      // and its git dir persist — other threads may still run in it. Use
      // `worktrees:archive` to tear the whole worktree down.
      await threadService.bringWorktreeToLocal(id);
    },
    "threads:setEnvironment": async (threadId, worktree) => {
      const before = appService.snapshot().threads.find((t) => t.id === threadId);
      if (!before?.projectId) return;
      if ((before.worktreeDir != null) === worktree) return;
      // Resolve a freshly-created worktree record + dir before disposing.
      if (worktree) {
        const dir = await gitService.createWorktree(before.projectId);
        const wt = appService.addWorktree(before.projectId, dir);
        await threadService.setEnvironment(threadId, wt.id, wt.dir);
      } else {
        await threadService.setEnvironment(threadId, null, undefined);
        // Tear down the old worktree record + git checkout.
        if (before.worktreeId) {
          const project = appService.snapshot().projects.find((p) => p.id === before.projectId);
          if (project && before.worktreeDir) {
            await gitService.removeWorktree(project.path, before.worktreeDir);
          }
          appService.archiveWorktree(before.worktreeId);
        }
      }
    },
    "subagents:listAgents": (projectId) => subagentService.listAgents(projectId),
    "subagents:updateAgent": (filePath, patch) => subagentService.updateAgent(filePath, patch),
    "graphify:status": (id) => graphifyService.status(id),
    "graphify:build": (id) => graphifyService.build(id),
    "graphify:update": (id) => graphifyService.update(id),
    "graphify:openViewer": (id) => graphifyService.openViewer(id),
    "graphify:report": (id) => graphifyService.report(id),
    "devtap:projectStatus": (id) => devTapInstallService.status(id),
    "git:info": (id) => gitService.info(id),
    "git:changedFiles": (id) => gitService.changedFiles(id),
    "git:fileDiff": (id, filePath) => gitService.fileDiff(id, filePath),
    "git:commitPush": (id, message) => gitService.commitPush(id, message),
    "git:createPr": (id) => gitService.createPr(id),
    "git:mergeToLocal": (id) => gitService.mergeToLocal(id),
    "git:pushLocal": (id) => gitService.pushLocal(id),
    // remote session hosting (ADR-0009)
    "remote:hostStatus": () => remoteHost.status(),
    "remote:setHostEnabled": async (enabled) => {
      if (enabled) await remoteHost.start();
      else await remoteHost.stop();
      emit("event:remoteHostStatus", undefined);
      return remoteHost.status();
    },
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
    "remote:listHosts": () => remoteClient.listHosts(),
    "remote:addHost": (input) => remoteClient.addHost(input),
    "remote:removeHost": (id) => remoteClient.removeHost(id),
    "remote:listSessions": (hostId) => remoteClient.listSessions(hostId),
    "remote:attach": (hostId, threadId) => remoteClient.attach(hostId, threadId),
    "remote:detach": () => remoteClient.detach(),
    "remote:pullToTest": (hostId, threadId) => remoteClient.pullToTest(hostId, threadId),
    "usage:list": () => usageService.list(),
    "usage:refresh": () => usageService.refresh(),
    "threads:steer": (id, text) => threadService.steer(id, text),
    "threads:promoteFollowUpToSteer": (id, index) => threadService.promoteFollowUpToSteer(id, index),
    "threads:popLastFollowUp": (id) => threadService.popLastFollowUp(id),
    "threads:deleteFollowUp": (id, index) => threadService.deleteFollowUp(id, index),
    "threads:deleteSteer": (id, index) => threadService.deleteSteer(id, index),
    "threads:abort": (id) => threadService.abort(id),
    "threads:getTranscript": (id) => threadService.getTranscript(id),
    "threads:snooze": (id, until) => appService.snoozeThread(id, until),
    "threads:unsnooze": (id) => appService.unsnoozeThread(id),
    "threads:markToTest": (id) => threadService.markToTest(id),
    "threads:unmarkToTest": (id) => appService.unmarkToTest(id),
  });

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
