import type { BrowserWindow } from "electron";
import { screen } from "electron";
import { createMainWindow } from "./windows/main-window.ts";
import {
  createHudWindow,
  HUD_WIDTH,
  HUD_COLLAPSED_HEIGHT,
  HUD_EXPANDED_HEIGHT,
} from "./windows/hud-window.ts";
import type { AppService } from "./services/app-service.ts";
import type { ThreadService } from "./services/thread-service.ts";

/**
 * Persistent floating HUD window lifecycle (CONTEXT.md, ADR-0002).
 *
 * Owns the `mainWindow`/`hudWindow`/`hudExpanded` mutable state and the
 * toggle/create/expand/reposition/measure closures that were previously inlined
 * in `boot()`. Isolated from the IPC table so geometry changes don't touch
 * handler wiring. ⌘⇧Space toggles; the HUD always renders the real Composer,
 * which needs a thread (seeded from the Main Window selection or a fresh chat).
 */
export class HudLifecycle {
  private mainWindow: BrowserWindow | null = null;
  private hudWindow: BrowserWindow | null = null;
  private hudExpanded = false;

  constructor(
    private readonly appService: AppService,
    private readonly threadService: ThreadService,
  ) {}

  /** True when the HUD exists and is on screen. */
  isHudUp(): boolean {
    return !!this.hudWindow && !this.hudWindow.isDestroyed() && this.hudWindow.isVisible();
  }

  /** Lazily create / re-show the Main Window (used when the HUD hides). */
  showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) this.mainWindow = createMainWindow();
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  /** Create the Main Window on boot (returns it so callers can keep a ref). */
  initMainWindow(): BrowserWindow {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) this.mainWindow = createMainWindow();
    return this.mainWindow;
  }

  /** Current HUD window (null when none / destroyed). Exposed for IPC handlers
   *  that need to poke it directly (setIgnoreMouseEvents / blur / hide). */
  getHudWindow(): BrowserWindow | null {
    if (!this.hudWindow || this.hudWindow.isDestroyed()) return null;
    return this.hudWindow;
  }

  /** Toggle the HUD on/off. Called from the global shortcut + `hud:toggle`. */
  async toggleHud(): Promise<void> {
    if (!this.hudWindow || this.hudWindow.isDestroyed()) {
      const geom = await this.hudGeometry();
      this.hudWindow = createHudWindow(geom);
      this.hudExpanded = false;
      void this.ensureHudThread();
      // The HUD takes over: hide the rest of the app for a seamless transition.
      this.hudWindow.once("ready-to-show", () => {
        this.hudWindow?.show();
        this.mainWindow?.hide();
      });
      return;
    }
    if (this.hudWindow.isVisible()) {
      this.hudWindow.hide();
      this.showMainWindow();
    } else {
      void this.ensureHudThread();
      await this.repositionHud();
      this.hudWindow.show();
      this.hudWindow.focus();
      this.mainWindow?.hide();
    }
  }

  /**
   * Ensure the HUD has a thread to render. Seeds from the Main Window's
   * selection, else starts a fresh chat.
   */
  async ensureHudThread(): Promise<void> {
    if (this.appService.seedHudThread()) return;
    const thread = await this.threadService.createChat();
    this.appService.setHudThread(thread.id);
  }

  /**
   * Measure the Main Window's real composer device (screen coords) so the HUD
   * can match its exact width and position — the composer "stays where it is".
   */
  async measureComposerRect(): Promise<
    { x: number; y: number; width: number; bottom: number } | null
  > {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;
    try {
      const r = (await this.mainWindow.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('footer.composer-device');
          if (!el) return null; const b = el.getBoundingClientRect();
          return { left: b.left, top: b.top, width: b.width, height: b.height }; })()`,
      )) as { left: number; top: number; width: number; height: number } | null;
      if (!r) return null;
      const c = this.mainWindow.getContentBounds();
      return { x: c.x + r.left, y: c.y + r.top, width: r.width, bottom: c.y + r.top + r.height };
    } catch {
      return null;
    }
  }

  /**
   * Where + how wide the HUD opens. When the composer is on screen the HUD
   * follows it exactly (seamless) regardless of window state (default/fullscreen)
   * The HUD always opens centred on the active screen, anchored to the bottom
   * with the same margin as in-app (the composer's own pb-6 sits inside the
   * window) — regardless of where it was last. Width still matches the real
   * composer when one is on screen.
   */
  async hudGeometry(): Promise<{ x: number; y: number; width: number }> {
    const rect = await this.measureComposerRect();
    const width = rect?.width ?? HUD_WIDTH;
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    return {
      x: Math.round(wa.x + (wa.width - width) / 2),
      y: wa.y + wa.height - HUD_COLLAPSED_HEIGHT,
      width,
    };
  }

  /** Re-centre an existing HUD on re-show, keeping its bottom edge stable. */
  async repositionHud(): Promise<void> {
    if (!this.hudWindow || this.hudWindow.isDestroyed()) return;
    const geom = await this.hudGeometry();
    const [, h = HUD_COLLAPSED_HEIGHT] = this.hudWindow.getSize();
    this.hudWindow.setBounds({
      x: geom.x,
      y: geom.y + HUD_COLLAPSED_HEIGHT - h,
      width: Math.round(geom.width),
      height: h,
    });
  }

  /** Expand/collapse the chat: grow the window upward, composer anchored at bottom. */
  setHudExpanded(expanded: boolean): void {
    if (!this.hudWindow || this.hudWindow.isDestroyed() || this.hudExpanded === expanded) return;
    this.hudExpanded = expanded;
    const [x = 0, y = 0] = this.hudWindow.getPosition();
    const [, h = HUD_COLLAPSED_HEIGHT] = this.hudWindow.getSize();
    const [w = HUD_WIDTH] = this.hudWindow.getSize();
    const bottom = y + h;
    const height = expanded ? HUD_EXPANDED_HEIGHT : HUD_COLLAPSED_HEIGHT;
    this.hudWindow.setBounds({ x, y: bottom - height, width: w, height });
  }
}
