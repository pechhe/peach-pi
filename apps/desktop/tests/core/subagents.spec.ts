import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("subagent pi-command wrapper runs the bundled CLI; agents view lists roster", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  // PI_SUBAGENT_PI_COMMAND is a shell-style command string (the extension
  // word-splits + de-quotes it), so run it through a shell, not execFile.
  const command = await app.evaluate(() => process.env.PI_SUBAGENT_PI_COMMAND);
  expect(command).toBeTruthy();
  const version = execSync(`${command} --version`, { encoding: "utf8", timeout: 30_000 });
  expect(version.trim()).toMatch(/^\d+\.\d+\.\d+/);

  // Roster view renders (this machine has global agents, e.g. scout).
  await window.getByTestId("nav-agents").click();
  await expect(window.getByTestId("agents-view")).toBeVisible();

  await app.close();
});
