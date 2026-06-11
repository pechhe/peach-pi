import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { openDb } from "./persistence/db.ts";
import { createEmitter, registerIpcHandlers } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
import { ThreadService } from "./services/thread-service.ts";
import { AutomationService } from "./services/automation-service.ts";
import { createMainWindow } from "./windows/main-window.ts";

// Test isolation: override userData before any path use.
if (process.env.PEACH_PI_USER_DATA) {
  app.setPath("userData", process.env.PEACH_PI_USER_DATA);
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
  const threadService = new ThreadService(
    db,
    emit,
    () => emit("event:snapshot", appService.snapshot()),
    path.join(app.getPath("userData"), "chats"),
  );
  const automationService = new AutomationService(db, threadService, () =>
    emit("event:snapshot", appService.snapshot()),
  );

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
    "projects:add": (p) => appService.addProject(p),
    "projects:remove": (id) => appService.removeProject(id),
    "projects:pick": () => pickProject(),
    "threads:create": (projectId) => threadService.createThread(projectId),
    "threads:createChat": () => threadService.createChat(),
    "threads:prompt": (id, text, images, toolMode) =>
      threadService.prompt(id, text, images, toolMode),
    "threads:listCommands": (id) => threadService.listCommands(id),
    "threads:listModels": (id) => threadService.listModels(id),
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
    "resources:inspect": (projectId) => threadService.inspectResources(projectId),
    "resources:readMarkdown": async (filePath) => (await import("node:fs/promises")).readFile(filePath, "utf8"),
    "threads:archive": (id) => threadService.archive(id),
    "threads:unarchive": (id) => threadService.unarchive(id),
    "threads:delete": (id) => threadService.delete(id),
    "threads:steer": (id, text) => threadService.steer(id, text),
    "threads:abort": (id) => threadService.abort(id),
    "threads:getTranscript": (id) => threadService.getTranscript(id),
    "threads:snooze": (id, until) => appService.snoozeThread(id, until),
    "threads:unsnooze": (id) => appService.unsnoozeThread(id),
    "threads:markToTest": (id, note) => appService.markToTest(id, note),
    "threads:unmarkToTest": (id) => appService.unmarkToTest(id),
  });

  appService.start();
  automationService.start();
  createMainWindow();

  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  app.on("window-all-closed", () => {
    // macOS convention: stay alive.
  });

  app.on("before-quit", () => {
    appService.stop();
    automationService.stop();
    threadService.dispose();
    db.close();
  });
}
