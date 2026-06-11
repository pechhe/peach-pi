import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("automation create form previews next run; created automation listed", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  await window.getByTestId("nav-automations").click();
  await expect(window.getByTestId("automations-view")).toBeVisible();

  await window.getByTestId("new-automation").click();
  const form = window.getByTestId("automation-form");
  await form.getByPlaceholder("Name (e.g. Morning triage)").fill("Test schedule");
  await form.getByPlaceholder("Prompt to run").fill("say hi");
  await expect(form.getByText(/Next run:/)).toBeVisible();

  // Invalid cron disables create.
  await form.getByPlaceholder("cron (m h dom mon dow)").fill("nonsense");
  await expect(form.getByText("Invalid cron expression")).toBeVisible();
  await expect(window.getByTestId("create-automation")).toBeDisabled();

  await form.getByPlaceholder("cron (m h dom mon dow)").fill("0 9 * * *");
  await expect(window.getByTestId("create-automation")).toBeEnabled();
  await window.getByTestId("create-automation").click();

  await expect(window.getByText("Test schedule")).toBeVisible();
  await expect(window.getByText("0 9 * * *")).toBeVisible();

  await app.close();
});
