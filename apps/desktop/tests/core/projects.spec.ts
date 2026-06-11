import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchApp } from "../helpers/electron-app";

test("adding a project updates the sidebar via snapshot events", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const dir = mkdtempSync(path.join(tmpdir(), "pp-proj-"));
  const name = path.basename(dir);
  await window.evaluate(
    (p) => (window as never as { peachPi: { invoke: (c: string, a: string) => Promise<unknown> } })
      .peachPi.invoke("projects:add", p),
    dir,
  );

  await expect(window.getByText(name)).toBeVisible();
  await expect(window.getByTestId("new-thread")).toBeAttached();
  await app.close();
});
