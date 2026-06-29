import { BrowserWindow, shell } from "electron";
import path from "node:path";
import { TRAFFIC_LIGHTS } from "@peach-pi/shared-types";
import { attachDevTapToWindow } from "@devtap/electron";

import { isExternalUrl } from "./url-guard";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: TRAFFIC_LIGHTS.position,
    backgroundColor: "#101012",
    webPreferences: {
      // CJS bundle (Forge vite plugin) — __dirname is .vite/build/
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Block in-app navigation; external http(s)/mailto links go to the OS
  // default browser instead of opening inside the renderer.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    event.preventDefault();
  });
  attachDevTapToWindow(win);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return win;
}
