import { test, expect, type ElectronApplication } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

/** Is the #hud window centred horizontally and flush to the work-area bottom? */
const placement = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("#hud"),
    );
    if (!w) return null;
    const b = w.getBounds();
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    return {
      centred: Math.abs(b.x - Math.round(wa.x + (wa.width - b.width) / 2)) <= 1,
      atBottom: Math.abs(b.y + b.height - (wa.y + wa.height)) <= 1,
    };
  });

const moveHud = (app: ElectronApplication, x: number, y: number) =>
  app.evaluate(
    ({ BrowserWindow }, p) => {
      const w = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes("#hud"),
      );
      w?.setPosition(p.x, p.y);
    },
    { x, y },
  );

test("HUD always opens centred at the bottom of the screen, wherever it was", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  // First open → centred, bottom-anchored.
  const hudPromise = app.waitForEvent("window");
  await window.evaluate(() => window.peachPi.invoke("hud:toggle"));
  await hudPromise;
  await expect.poll(() => placement(app)).toEqual({ centred: true, atBottom: true });

  // Drag it to a corner, then toggle off + on → it snaps back to centre-bottom.
  await moveHud(app, 40, 40);
  await window.evaluate(() => window.peachPi.invoke("hud:toggle"));
  await window.evaluate(() => window.peachPi.invoke("hud:toggle"));
  await expect.poll(() => placement(app)).toEqual({ centred: true, atBottom: true });

  await app.close();
});
