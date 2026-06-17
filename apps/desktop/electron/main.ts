import { app, BrowserWindow, dialog, globalShortcut, Notification } from "electron";
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
import { getCavemanState, setCavemanEnabled } from "./services/caveman.ts";
import { getPiSettings, setPiSettings } from "./services/pi-settings.ts";
import { computePiHealth } from "./services/pi-health.ts";
import { createMainWindow } from "./windows/main-window.ts";
import { createOverlayWindow } from "./windows/overlay-window.ts";

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

// Boot sequence only. Feature logic lives in services.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void boot();
}

async function boot(): Promise<void> {
  await app.whenReady();

  const db = openDb(path.join(app.getPath("userData"), "peach-pi.sqlite"));
  const emit = createEmitter(() => BrowserWindow.getAllWindows());
  const appService = new AppService(db, emit);
  let mainWindow: BrowserWindow | null = null;
  let overlayWindow: BrowserWindow | null = null;

  const threadService = new ThreadService(
    db,
    emit,
    () => emit("event:snapshot", appService.snapshot()),
    path.join(app.getPath("userData"), "chats"),
    (thread) => {
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
  );
  const automationService = new AutomationService(db, threadService, () =>
    emit("event:snapshot", appService.snapshot()),
  );
  const terminalService = new TerminalService(db, emit);
  const gitService = new GitService(
    db,
    path.join(app.getPath("userData"), "worktrees"),
    () => appService.getUtilityModel(),
  );
  const subagentService = new SubagentService(db);
  const graphifyService = new GraphifyService(db);
  setupSubagentEnvironment(app.getPath("userData"));

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
    "app:listModels": () => appService.listModels(),
    "app:getUtilityModel": () => appService.getUtilityModel(),
    "app:setUtilityModel": (model) => appService.setUtilityModel(model),
    "app:getAutoCompact": () => appService.getAutoCompact(),
    "app:setAutoCompact": (settings) => appService.setAutoCompact(settings),
    "app:getPiSettings": () => getPiSettings(),
    "app:setPiSettings": (patch) => setPiSettings(patch),
    "app:getPiHealth": () => computePiHealth(__dirname),
    "ui:setSidebarWidth": (width) => appService.setSidebarWidth(width),
    "projects:add": (p) => appService.addProject(p),
    "projects:remove": (id) => appService.removeProject(id),
    "projects:pick": () => pickProject(),
    "projects:reorder": (orderedIds) => appService.reorderProjects(orderedIds),
    "projects:setCollapsed": (projectId, collapsed) =>
      appService.setProjectCollapsed(projectId, collapsed),
    "threads:create": async (projectId, opts) => {
      const worktreeDir = opts?.worktree ? await gitService.createWorktree(projectId) : undefined;
      return threadService.createThread(projectId, worktreeDir);
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
    "threads:compact": (id) => threadService.compact(id),
    "automations:create": (fields) => automationService.create(fields),
    "automations:setEnabled": (id, enabled) => automationService.setEnabled(id, enabled),
    "automations:delete": (id) => automationService.delete(id),
    "automations:runNow": (id) => automationService.runNow(id),
    "automations:runs": (id) => automationService.runs(id),
    "automations:previewNext": (cron) => automationService.previewNext(cron),
    "overlay:hide": () => {
      overlayWindow?.hide();
    },
    "overlay:toggle": () => toggleOverlay(),
    "terminal:open": (id) => terminalService.open(id),
    "terminal:input": (id, data) => terminalService.input(id, data),
    "terminal:resize": (id, cols, rows) => terminalService.resize(id, cols, rows),
    "terminal:kill": (id) => terminalService.kill(id),
    "resources:inspect": (projectId) => threadService.inspectResources(projectId),
    "resources:readMarkdown": async (filePath) => (await import("node:fs/promises")).readFile(filePath, "utf8"),
    "files:readImage": (filePath) => readImageFile(filePath),
    "threads:archive": (id) => threadService.archive(id),
    "threads:unarchive": (id) => threadService.unarchive(id),
    "threads:delete": async (id) => {
      const thread = appService.snapshot().threads.find((t) => t.id === id);
      threadService.delete(id);
      if (thread?.worktreeDir && thread.projectId) {
        const project = appService.snapshot().projects.find((p) => p.id === thread.projectId);
        if (project) await gitService.removeWorktree(project.path, thread.worktreeDir);
      }
    },
    "threads:setEnvironment": async (threadId, worktree) => {
      const before = appService.snapshot().threads.find((t) => t.id === threadId);
      if (!before?.projectId) return;
      if ((before.worktreeDir != null) === worktree) return;
      // Resolve the new worktree dir before disposing anything.
      const newDir = worktree ? await gitService.createWorktree(before.projectId) : undefined;
      await threadService.setEnvironment(threadId, newDir);
      // Tear down the old worktree when switching back to the project dir.
      if (before.worktreeDir && !worktree) {
        const project = appService.snapshot().projects.find((p) => p.id === before.projectId);
        if (project) await gitService.removeWorktree(project.path, before.worktreeDir);
      }
    },
    "subagents:listAgents": (projectId) => subagentService.listAgents(projectId),
    "graphify:status": (id) => graphifyService.status(id),
    "graphify:build": (id) => graphifyService.build(id),
    "graphify:update": (id) => graphifyService.update(id),
    "graphify:openViewer": (id) => graphifyService.openViewer(id),
    "graphify:report": (id) => graphifyService.report(id),
    "git:info": (id) => gitService.info(id),
    "git:changedFiles": (id) => gitService.changedFiles(id),
    "git:fileDiff": (id, filePath) => gitService.fileDiff(id, filePath),
    "git:commitPush": (id, message) => gitService.commitPush(id, message),
    "git:createPr": (id) => gitService.createPr(id),
    "threads:steer": (id, text) => threadService.steer(id, text),
    "threads:promoteFollowUpToSteer": (id, index) => threadService.promoteFollowUpToSteer(id, index),
    "threads:popLastFollowUp": (id) => threadService.popLastFollowUp(id),
    "threads:abort": (id) => threadService.abort(id),
    "threads:getTranscript": (id) => threadService.getTranscript(id),
    "threads:snooze": (id, until) => appService.snoozeThread(id, until),
    "threads:unsnooze": (id) => appService.unsnoozeThread(id),
    "threads:markToTest": (id) => threadService.markToTest(id),
    "threads:unmarkToTest": (id) => appService.unmarkToTest(id),
  });

  // Composer-only floating overlay (plan decision #4). ⌘⇧Space toggles.
  function toggleOverlay(): void {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      overlayWindow = createOverlayWindow();
      overlayWindow.once("ready-to-show", () => overlayWindow?.show());
      return;
    }
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      overlayWindow.show();
      overlayWindow.focus();
    }
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
  mainWindow = createMainWindow();
  globalShortcut.register("CommandOrControl+Shift+Space", toggleOverlay);

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
    globalShortcut.unregisterAll();
    appService.stop();
    automationService.stop();
    terminalService.dispose();
    threadService.dispose();
    db.close();
  });
}
