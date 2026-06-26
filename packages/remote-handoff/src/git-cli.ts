import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Shared git CLI boundary — the single seam for shelling out to `git`.
 *
 * Previously four files each carried byte-equivalent private copies of
 * `git` / `gitOk` / `gitEnv` (and `gitOrFail` in one) plus a duplicated
 * `toHttpsRepoUrl` SSH→HTTPS normalizer. They are consolidated here so a
 * `maxBuffer` or normalizer bug is a fix-in-one-place problem, not four.
 *
 * Invariants (preserve exactly — every consumer relied on these):
 *  - `promisify(execFile)` against the `git` binary
 *  - `maxBuffer: 16 * 1024 * 1024`
 *  - the env variant spreads `process.env` then overlays the caller's env
 *
 * Pure dedup: zero behaviour change, zero ADR exposure. ADR-0010's
 * `RelayActions` thin-forwarder sits above this boundary and is untouched.
 */

const execFileAsync = promisify(execFile);

/** Run git, returning stdout. Throws on non-zero exit. */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/** Run git, returning true on success, false on any failure. */
export async function gitOk(args: string[], cwd: string): Promise<boolean> {
  try {
    await git(args, cwd);
    return true;
  } catch {
    return false;
  }
}

/** Run a read-only git probe with --no-optional-locks so it never creates or
 *  waits on the optional index/refs lockfiles. All worktrees of one repo
 *  share the same .git object DB; a plain `git status` / `git diff` from the
 *  main process contends with writers (agents committing in sibling
 *  worktrees), so every read probe should go through this. `--no-optional-locks`
 *  is a global option and must precede the subcommand. */
export async function gitRead(args: string[], cwd: string): Promise<string> {
  return git(["--no-optional-locks", ...args], cwd);
}

/** Read-only git probe, boolean form. See `gitRead`. */
export async function gitReadOk(args: string[], cwd: string): Promise<boolean> {
  try {
    await gitRead(args, cwd);
    return true;
  } catch {
    return false;
  }
}

/** Run git with extra env (e.g. GIT_INDEX_FILE for an isolated index). */
export async function gitEnv(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/** Run git, rethrowing with a readable suffix of stderr on failure. */
export async function gitOrFail(args: string[], cwd: string, what: string): Promise<string> {
  try {
    return await git(args, cwd);
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const tail = (e.stderr || e.message || "").trim().split("\n").slice(-3).join(" ");
    throw new Error(`${what} failed: ${tail}`);
  }
}

/** Normalize a git remote (ssh or https) to its https web base, sans .git. */
export function toHttpsRepoUrl(remote: string): string | null {
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const https = /^https?:\/\/(?:[^@]+@)?(.+?)(?:\.git)?$/.exec(remote);
  if (https) return `https://${https[1]}`;
  return null;
}
