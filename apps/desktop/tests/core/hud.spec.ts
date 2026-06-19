import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

/** Whether the #hud-hash window is currently visible. */
const hudVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("#hud"),
    );
    return !!w && w.isVisible();
  });

/** Current HUD window height (the #hud-hash window), or null if absent. */
const hudHeight = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("#hud"),
    );
    return w ? w.getBounds().height : null;
  });

async function openHud(app: ElectronApplication, mainWindow: Page): Promise<Page> {
  const hudPromise = app.waitForEvent("window");
  await mainWindow.evaluate(() => window.peachPi.invoke("hud:toggle"));
  return hudPromise;
}

test("HUD toggles, renders the composer, and persists on blur", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const hud = await openHud(app, window);
  await expect(hud.getByTestId("hud-composer")).toBeVisible();
  // The HUD renders the real composer device.
  await expect(hud.getByTestId("composer-input")).toBeVisible();
  await expect.poll(() => hudVisible(app)).toBe(true);

  // Blur must NOT hide the window (persistence, unlike the old launcher).
  await hud.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => hudVisible(app)).toBe(true);

  // Toggling again hides the HUD (and restores the Main Window).
  await window.evaluate(() => window.peachPi.invoke("hud:toggle"));
  await expect.poll(() => hudVisible(app)).toBe(false);

  await app.close();
});

test("HUD thread is independent of the Main Window selection (setThread + newChat)", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  // Two chats; select A in the Main Window.
  const { a, b } = await window.evaluate(async () => {
    const a = await window.peachPi.invoke("threads:createChat");
    const b = await window.peachPi.invoke("threads:createChat");
    await window.peachPi.invoke("app:setSelectedThread", a.id);
    return { a: a.id, b: b.id };
  });

  await openHud(app, window);
  // Seeded from the Main Window selection (A).
  await expect
    .poll(() => window.evaluate(() => window.peachPi.invoke("app:getSnapshot").then((s) => s.ui.hudThreadId)))
    .toBe(a);

  // setThread B → HUD points at B; Main Window selection stays A.
  await window.evaluate((id) => window.peachPi.invoke("hud:setThread", id), b);
  const ui1 = await window.evaluate(() => window.peachPi.invoke("app:getSnapshot").then((s) => s.ui));
  expect(ui1.hudThreadId).toBe(b);
  expect(ui1.selectedThreadId).toBe(a);

  // newChat becomes the HUD thread; Main Window selection still A.
  await window.evaluate(() => window.peachPi.invoke("hud:newChat"));
  const ui2 = await window.evaluate(() => window.peachPi.invoke("app:getSnapshot").then((s) => s.ui));
  expect(ui2.hudThreadId).not.toBe(a);
  expect(ui2.hudThreadId).not.toBe(b);
  expect(ui2.selectedThreadId).toBe(a);

  await app.close();
});

test("HUD reveal: click-to-pin expands, Esc collapses, pinned survives blur, hover-peek collapses on blur", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const hud = await openHud(app, window);
  await expect(hud.getByTestId("hud-composer")).toBeVisible();
  await expect.poll(() => hudHeight(app)).toBe(300);

  // Hover the composer pulls the card up → window grows taller.
  await hud.getByTestId("hud-composer").hover();
  await expect.poll(() => hudHeight(app)).toBe(660);

  // Click the raised card → pin open. Pinned survives a blur.
  await hud.getByTestId("hud-chat").click();
  await hud.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => hudHeight(app)).toBe(660);

  // Esc collapses back to the peek.
  await hud.getByTestId("composer-input").press("Escape");
  await expect.poll(() => hudHeight(app)).toBe(300);

  // Hover-expand (sustained) then blur → a non-pinned panel collapses.
  await hud.getByTestId("hud-composer").hover();
  await expect.poll(() => hudHeight(app)).toBe(660);
  await hud.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => hudHeight(app)).toBe(300);

  await app.close();
});
