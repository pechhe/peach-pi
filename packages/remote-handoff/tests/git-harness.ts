import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Run git in `cwd` with a clean identity so tests never depend on global config. */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Peach Test",
      GIT_AUTHOR_EMAIL: "test@peach.local",
      GIT_COMMITTER_NAME: "Peach Test",
      GIT_COMMITTER_EMAIL: "test@peach.local",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export interface Harness {
  root: string;
  /** Bare shared origin both clones fetch from / push to. */
  origin: string;
  /** The "home" clone — stands in for a machine's repo. */
  home: string;
  /** The "local" clone — another machine's repo. */
  local: string;
  index: number;
}

/** Create a bare origin + two clones with an initial commit on `main`. */
export async function setupHarness(): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), "peach-git-"));
  const origin = join(root, "origin.git");
  const home = join(root, "home");
  const local = join(root, "local");
  await git(["init", "--bare", "-b", "main", origin], root);
  await git(["clone", origin, home], root);
  writeFileSync(join(home, "README.md"), "# hello\n");
  await git(["add", "-A"], home);
  await git(["commit", "-m", "initial"], home);
  await git(["push", "-u", "origin", "main"], home);
  await git(["clone", origin, local], root);
  return { root, origin, home, local, index: 0 };
}

/** Tear down a harness's temp root. */
export function teardown(h: Harness): void {
  rmSync(h.root, { recursive: true, force: true });
}

/** Make a fresh worktree path under the harness root. */
export function worktreePath(h: Harness, name: string): string {
  return join(h.root, "wt", name);
}

/** Write/overwrite a file in `dir`. */
export function write(dir: string, rel: string, content: string): void {
  const full = join(dir, ...rel.split("/"));
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

/** Append to a file (to make a tree dirty without creating a new file). */
export function append(dir: string, rel: string, extra: string): void {
  const full = join(dir, ...rel.split("/"));
  mkdirSync(join(full, ".."), { recursive: true });
  const prev = existsSync(full) ? readFileSync(full, "utf8") : "";
  writeFileSync(full, prev + extra);
}

/** `git log --oneline` lines for `dir`. */
export async function logOneline(dir: string): Promise<string[]> {
  const out = await git(["log", "--oneline", "-n", "20"], dir);
  return out.split("\n").filter(Boolean);
}
