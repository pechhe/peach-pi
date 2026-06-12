import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("subagent pi-command wrapper runs the bundled CLI; agents view lists roster", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  // The wrapper must exist and execute the vendored pi CLI (asar-safe).
  const wrapper = await app.evaluate(() => process.env.PI_SUBAGENT_PI_COMMAND);
  expect(wrapper).toBeTruthy();
  const version = execFileSync(wrapper!, ["--version"], { encoding: "utf8", timeout: 30_000 });
  expect(version.trim()).toMatch(/^\d+\.\d+\.\d+/);

  // Roster view renders (this machine has global agents, e.g. scout).
  await window.getByTestId("nav-agents").click();
  await expect(window.getByTestId("agents-view")).toBeVisible();

  await app.close();
});
