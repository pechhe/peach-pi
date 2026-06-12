import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("overlay window toggles and renders the quick composer", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const overlayPromise = app.waitForEvent("window");
  await window.evaluate(() => window.peachPi.invoke("overlay:toggle"));
  const overlay = await overlayPromise;

  await expect(overlay.getByTestId("overlay-composer")).toBeVisible();
  await expect(overlay.getByTestId("overlay-input")).toBeVisible();
  // No thread selected → targets a new chat.
  await expect(overlay.getByText("→ New chat")).toBeVisible();

  // Esc hides the window (does not destroy it).
  await overlay.getByTestId("overlay-input").press("Escape");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
      ),
    )
    .toBe(1);

  await app.close();
});
