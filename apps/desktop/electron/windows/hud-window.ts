import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { attachDevTapToWindow } from "../services/devtap.ts";

import { isExternalUrl } from "./url-guard";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/** Fallback width when the real composer can't be measured (>= the device's
 *  natural 1025px frame so it still renders at full size). */
export const HUD_WIDTH = 1080;
/** Collapsed height: the real composer device + thin ambient peek. */
export const HUD_COLLAPSED_HEIGHT = 300;
/** Expanded height: chat panel grows upward above the composer (ADR-0002). */
export const HUD_EXPANDED_HEIGHT = 660;

/** Default bottom-centre anchor (collapsed) on the primary display's work area. */
export function defaultHudPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + (workArea.width - HUD_WIDTH) / 2),
    y: workArea.y + workArea.height - HUD_COLLAPSED_HEIGHT - 40,
  };
}

/**
 * Persistent floating HUD window (see CONTEXT.md, ADR-0002). One frameless,
 * transparent, always-on-top window over every Space and fullscreen app. Unlike
 * the old ephemeral launcher it does NOT hide on blur — it stays on screen while
 * you work in another app. Toggled via ⌘⇧Space.
 */
export function createHudWindow(geom: { x: number; y: number; width: number }): BrowserWindow {
  const win = new BrowserWindow({
    width: Math.round(geom.width),
    height: HUD_COLLAPSED_HEIGHT,
    x: geom.x,
    y: geom.y,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    event.preventDefault();
  });
  // No hide-on-blur: the HUD persists while you work in another app.
  attachDevTapToWindow(win);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#hud`);
  } else {
    void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      hash: "hud",
    });
  }
  return win;
}
