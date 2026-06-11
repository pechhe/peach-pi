import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("packaged app creates a live pi session (SDK vendored)", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const projectDir = mkdtempSync(path.join(tmpdir(), "peach-pi-e2e-"));
  const thread = await window.evaluate(async (dir) => {
    const project = await window.peachPi.invoke("projects:add", dir);
    return window.peachPi.invoke("threads:create", project.id);
  }, projectDir);

  expect(thread.id).toBeTruthy();
  expect(thread.piSessionFile).toBeTruthy(); // pi SDK loaded + session persisted

  // Thread UI renders with composer.
  await window.getByText("New thread").click();
  await expect(window.getByTestId("composer-input")).toBeVisible();

  await app.close();
});
