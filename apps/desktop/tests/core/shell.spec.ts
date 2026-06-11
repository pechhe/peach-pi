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

  await window.getByTestId("nav-skills").click();
  await expect(window.getByTestId("skills-view")).toBeVisible();

  await window.getByTestId("nav-extensions").click();
  await expect(window.getByTestId("extensions-view")).toBeVisible();

  await window.getByTestId("nav-settings").click();
  await expect(window.getByTestId("settings-view")).toBeVisible();
  const toggle = window.getByTestId("sounds-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await app.close();
});
