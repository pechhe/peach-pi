import { app, BrowserWindow, globalShortcut, Tray, nativeImage } from "electron";
import path from "node:path";
import { createEmitter } from "./ipc/registry.ts";
import { emitDevTapEvent, initDevTapMain } from "@devtap/electron";
import {
  startDevTapControlChannel,
  stopDevTapControlChannel,
} from "@devtap/electron";
import { computePiHealth } from "./services/pi-health.ts";
import { composeServices } from "./compose-services.ts";
import { registerIpcTable } from "./ipc-table.ts";
import { HudLifecycle } from "./hud-lifecycle.ts";
import { registerFinishCue } from "./services/finish-cue-router.ts";
import { NotchService } from "./services/notch-service.ts";

// CDP for renderer layout inspection — dev/unpackaged only, never in a
// shipped build (an open debugging port in production is a security hole).
if (!app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

// Test isolation: override userData before any path use.
if (process.env.PEACH_PI_USER_DATA) {
  app.setPath("userData", process.env.PEACH_PI_USER_DATA);
}

// Boot sequence only. Feature logic lives in services + the three split
// modules: compose-services (construction + wiring), ipc-table (handler
// registration), hud-lifecycle (HUD window state + geometry).
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

  const emit = createEmitter(() => BrowserWindow.getAllWindows());
  const svc = composeServices(app.getPath("userData"), emit);

  const hud = new HudLifecycle(svc.appService, svc.threadService);
  // Run-lifecycle finish cues (HUD vs system notification) subscribe to
  // ThreadService's frame bus here — the HudLifecycle is built after
  // composeServices, and the cue is now a subscriber (not a constructor
  // callback), so the cycle-breaking setters it used to need are gone.
  registerFinishCue({
    threadService: svc.threadService,
    appService: svc.appService,
    emit,
    hud,
  });
  // Notch surface (ADR-0016): a native Swift sidecar showing running/finished
  // counts + finish toasts. Subscribes to the same frame bus as the finish-cue
  // above; a missing helper binary disables it gracefully.
  const notch = new NotchService({
    threadService: svc.threadService,
    appService: svc.appService,
    emit,
    hud,
  });
  notch.start();

  registerIpcTable(svc, hud);

  // Startup compatibility check: surface bundled-pi ↔ extension drift early so
  // it shows up in logs even before the renderer queries it for the banner.
  void computePiHealth(__dirname).then((health) => {
    if (health.status === "ok") return;
    console.warn(`[pi-health] ${health.status}: app bundles pi ${health.hostVersion}`);
    for (const problem of health.problems) console.warn(`[pi-health]  - ${problem}`);
  });

  svc.appService.start();
  svc.automationService.start();
  svc.piUpdateService.start();
  svc.autoUpdateService.start();
  hud.initMainWindow();
  startDevTapControlChannel();
  globalShortcut.register("CommandOrControl+Shift+Space", () => hud.toggleHud());

  // Record & Replay tray — always-available Start/Stop/Cancel + live status.
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon-1024.png"));
  if (!trayIcon.isEmpty()) trayIcon.resize({ width: 20, height: 20 });
  const tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setTitle("REC");
  svc.recordingService.attachTray(tray);
  // Clip capture shares the recorder tray: contribute its menu items and ask
  // the tray to rebuild whenever clip state changes.
  svc.recordingService.setMenuExtras(() => svc.clipService.trayItems());
  svc.clipService.setTrayRefresh(() => svc.recordingService.requestTrayRefresh());

  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) hud.initMainWindow();
  });

  app.on("window-all-closed", () => {
    // macOS convention: stay alive.
  });

  app.on("before-quit", () => {
    emitDevTapEvent({ area: "lifecycle", event: "app.before-quit" });
    stopDevTapControlChannel();
    globalShortcut.unregisterAll();
    notch.dispose();
    svc.appService.stop();
    svc.automationService.stop();
    svc.piUpdateService.stop();
    svc.terminalService.dispose();
    svc.recordingService.dispose();
    svc.clipService.dispose();
    tray?.destroy();
    void svc.bwsResolver.stop();
    svc.threadService.dispose();
    svc.remoteClient.detach();
    void svc.remoteHost.stop();
    svc.insomniaService.dispose();
    svc.db.close();
  });
}
