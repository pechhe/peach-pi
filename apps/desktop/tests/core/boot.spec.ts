import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("packaged app boots, IPC works, snapshot renders", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });
  await expect(window.getByTestId("boot-ok")).toContainText("projects");
  await app.close();
});
