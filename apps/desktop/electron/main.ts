import { app, BrowserWindow } from "electron";
import path from "node:path";
import { openDb } from "./persistence/db.ts";
import { createEmitter, registerIpcHandlers } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
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

  registerIpcHandlers({
    "app:getSnapshot": () => appService.snapshot(),
    "app:ping": () => ({ pong: true, version: app.getVersion() }),
    "projects:add": (p) => appService.addProject(p),
    "projects:remove": (id) => appService.removeProject(id),
    "threads:snooze": (id, until) => appService.snoozeThread(id, until),
    "threads:unsnooze": (id) => appService.unsnoozeThread(id),
    "threads:markToTest": (id, note) => appService.markToTest(id, note),
    "threads:unmarkToTest": (id) => appService.unmarkToTest(id),
  });

  appService.start();
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
    db.close();
  });
}
