import { BrowserWindow, Notification } from "electron";
import type { AppService } from "./app-service.ts";
import type { ThreadService } from "./thread-service.ts";
import type { Emit } from "../ipc/registry.ts";
import type { HudLifecycle } from "../hud-lifecycle.ts";
import { routeFinishCue } from "./finish-cue.ts";

/** Subscribe the finish-cue router to `ThreadService`'s run-lifecycle status
 *  frames. Registered from `main()` once the `HudLifecycle` exists — this is
 *  the RunLifecycle seam: the cue is a *subscriber*, not a constructor
 *  callback, so the `setHudUpPredicate` / `setShowMainWindow` cycle-breakers it
 *  used to need are gone (subscription is deferred to where `hud` already is).
 *
 *  The routing decision itself lives in the pure, electron-free
 *  `routeFinishCue` so it is unit-testable; this module only reads the Electron
 *  globals and acts on the route. Returns a disposer (kept for symmetry with
 *  `subscribe`). */
export function registerFinishCue(deps: {
  threadService: ThreadService;
  appService: AppService;
  emit: Emit;
  hud: HudLifecycle;
}): () => void {
  const { threadService, appService, emit, hud } = deps;
  return threadService.subscribe((frame) => {
    if (frame.kind !== "status") return;
    const route = routeFinishCue(
      frame.status,
      hud.isHudUp(),
      !!BrowserWindow.getFocusedWindow(),
    );
    if (route === null) return;
    const thread = appService.snapshot().threads.find((t) => t.id === frame.threadId);
    if (!thread) return;
    if (route === "hud") {
      // HUD owns the screen → route as an ambient cue (the renderer decides
      // pulse/expand/badge via routeFinishCue) instead of a system notification.
      emit("event:hudFinish", { threadId: thread.id });
      return;
    }
    // Backgrounded → macOS notification (Phase 6). The app has its own done
    // sound, so the notification stays silent.
    if (!Notification.isSupported()) return;
    const note = new Notification({
      title: thread.title || "Thread finished",
      body: "Run complete — click to open.",
      silent: true,
    });
    note.on("click", () => {
      hud.showMainWindow();
      emit("event:focusThread", thread.id);
    });
    note.show();
  });
}
