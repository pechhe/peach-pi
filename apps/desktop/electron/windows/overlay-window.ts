import { BrowserWindow, screen } from "electron";
import path from "node:path";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Floating composer-only window (plan decision #4). Frameless, always on top,
 * visible on all workspaces. Toggled via global shortcut; hides on blur/Esc.
 */
export function createOverlayWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 620;
  const win = new BrowserWindow({
    width,
    height: 200,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + 120,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#101012",
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
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.on("blur", () => win.hide());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#overlay`);
  } else {
    void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      hash: "overlay",
    });
  }
  return win;
}
