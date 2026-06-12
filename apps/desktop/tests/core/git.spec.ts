import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron-app";

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "peach-pi-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  git("init", "-b", "main");
  git("config", "user.email", "e2e@test");
  git("config", "user.name", "e2e");
  writeFileSync(path.join(dir, "a.txt"), "hello\n");
  git("add", "-A");
  git("commit", "-m", "init");
  return dir;
}

test("git widget: info, changed files, commit; worktree thread is detached", async () => {
  const app = await launchApp();
  const window = await app.firstWindow();
  await expect(window.getByTestId("boot-ok")).toBeVisible({ timeout: 15_000 });

  const repo = makeRepo();
  writeFileSync(path.join(repo, "a.txt"), "hello world\n");

  const out = await window.evaluate(async (dir) => {
    const project = await window.peachPi.invoke("projects:add", dir);
    const thread = await window.peachPi.invoke("threads:create", project.id);
    const info = await window.peachPi.invoke("git:info", thread.id);
    const files = await window.peachPi.invoke("git:changedFiles", thread.id);
    const diff = await window.peachPi.invoke("git:fileDiff", thread.id, "a.txt");
    const commit = await window.peachPi.invoke("git:commitPush", thread.id, "test: e2e commit");
    const after = await window.peachPi.invoke("git:info", thread.id);
    const wtThread = await window.peachPi.invoke("threads:create", project.id, { worktree: true });
    const wtInfo = await window.peachPi.invoke("git:info", wtThread.id);
    return { info, files, diff, commit, after, wtInfo };
  }, repo);

  expect(out.info.isRepo).toBe(true);
  expect(out.info.branch).toBe("main");
  expect(out.info.changedCount).toBe(1);
  expect(out.info.insertions).toBeGreaterThan(0);
  expect(out.files[0]).toMatchObject({ path: "a.txt", status: "modified" });
  expect(out.diff).toContain("+hello world");
  expect(out.commit).toMatchObject({ ok: true, branch: "main", message: "test: e2e commit", pushed: false });
  expect(out.after.changedCount).toBe(0);
  // Worktree thread: isolated detached checkout, lazy branch comes on commit.
  expect(out.wtInfo).toMatchObject({ isRepo: true, branch: null, isWorktree: true });

  await app.close();
});
