import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("⌘K opens search overlay; testing view reachable from nav", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  await window.keyboard.press("Meta+k");
  await expect(window.getByTestId("search-overlay")).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByTestId("search-overlay")).not.toBeVisible();

  await window.getByTestId("nav-testing").click();
  await expect(window.getByTestId("testing-view")).toBeVisible();

  await app.close();
});
