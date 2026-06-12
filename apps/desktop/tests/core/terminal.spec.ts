import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

test("integrated terminal spawns a PTY in the project dir and echoes output", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const projectDir = mkdtempSync(path.join(tmpdir(), "peach-pi-term-"));
  await window.evaluate(async (dir) => {
    const project = await window.peachPi.invoke("projects:add", dir);
    return window.peachPi.invoke("threads:create", project.id);
  }, projectDir);

  await window.getByRole("button", { name: "New thread" }).click();
  await window.getByTestId("terminal-toggle").click();
  await expect(window.getByTestId("terminal-pane")).toBeVisible();

  // Shell prompt may be slow under -l; type a command and assert its output.
  await window.waitForTimeout(1500);
  await window.getByTestId("terminal-pane").click();
  await window.keyboard.type("echo pty-$((20+22))\n");
  await expect(window.getByTestId("terminal-pane")).toContainText("pty-42", { timeout: 10_000 });

  // Hide keeps the PTY; reopening replays the scrollback buffer.
  await window.getByText("▾ hide").click();
  await expect(window.getByTestId("terminal-pane")).toBeHidden();
  await window.getByTestId("terminal-toggle").click();
  await expect(window.getByTestId("terminal-pane")).toContainText("pty-42", { timeout: 5_000 });

  await app.close();
});
