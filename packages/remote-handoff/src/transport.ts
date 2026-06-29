import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HandoffThread, Machine, RemoteThreadStatus } from "./types.ts";
import { logPath } from "./logs.ts";
import { readLog } from "./logs.ts";

const execFileAsync = promisify(execFile);

/**
 * The transport seam: how one machine asks another to do something to a thread.
 *
 * Kept as an interface so the implementation can be swapped (SSH today; the
 * repo's existing tailnet HTTP relay, or a native RPC, later) without touching
 * `HandoffService`. Every method is a thin RPC to the peer's
 * `peach daemon <sub>` — the transport carries no business logic.
 *
 * Each machine is symmetric: there is no fixed master. `local` is just the
 * machine that currently owns the thread.
 */
export interface RemoteTransport {
  /** Is the peer reachable? Cheap liveness probe. */
  ping(machine: Machine): Promise<boolean>;
  /** Owned-thread status from the peer, for `peach status` on a non-owner. */
  threadStatus(machine: Machine, threadId: string): Promise<RemoteThreadStatus>;
  /** Ask the current owner to stop/pause its worker before the move. */
  pause(machine: Machine, threadId: string): Promise<boolean>;
  /** Ask the new owner to (re)launch/resume the worker. */
  start(machine: Machine, threadId: string): Promise<boolean>;
  /** Run a WIP checkpoint + push on the owner before the move. */
  checkpoint(machine: Machine, threadId: string): Promise<{ sha: string | null; pushed: boolean }>;
  /** Ensure the peer's worktree exists for the thread (post-fetch). */
  ensureWorktree(machine: Machine, threadId: string): Promise<{ workspacePath: string | null }>;
  /** Fetch the tail of the peer's thread log (polling — MVP). */
  logs(machine: Machine, threadId: string, lines?: number): Promise<string>;
  /** Create a recovery branch on the peer before a forced takeover. */
  recoveryBranch(machine: Machine, threadId: string): Promise<string | null>;

  /** Push a thread record into the peer's registry so it can host the thread.
   *  Used by `remote start` (→ remote) and `send` (→ remote) to seed the
   *  receiver with branch/command/base metadata before it creates a worktree. */
  importThread(machine: Machine, thread: HandoffThread): Promise<boolean>;
}

/** Result of running a `peach daemon` command on a peer. */
export interface DaemonResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run `peach daemon <args>` on a peer machine over SSH. */
async function sshDaemon(
  machine: Machine,
  args: string[],
  timeoutMs = 30_000,
): Promise<DaemonResult> {
  if (!machine.sshHost) throw new Error(`machine ${machine.name} has no sshHost`);
  // `peach` must be on the peer's PATH. A login shell (-p preserves env) keeps
  // nvm/homebrew PATH. stdout is JSON where the daemon emits it.
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-o", "ConnectTimeout=8", "-o", "BatchMode=yes", machine.sshHost, "peach", "daemon", ...args],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string; signal?: string };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(e.signal ?? err),
      code: typeof e.code === "number" ? e.code : -1,
    };
  }
}

/** Parse the JSON a `peach daemon` subcommand prints to stdout. */
function parseJson<T>(res: DaemonResult): T {
  if (res.code !== 0) throw new Error(`peer error: ${res.stderr.trim() || `exit ${res.code}`}`);
  try {
    return JSON.parse(res.stdout.trim() || "null") as T;
  } catch {
    throw new Error(`peer returned non-JSON: ${res.stdout.trim().slice(0, 200)}`);
  }
}

/** SSH transport: each method is one `ssh host peach daemon <sub>` round-trip. */
export class SshTransport implements RemoteTransport {
  async ping(machine: Machine): Promise<boolean> {
    if (!machine.sshHost) return false;
    const res = await sshDaemon(machine, ["ping"], 10_000);
    return res.code === 0 && res.stdout.trim() === "pong";
  }

  async threadStatus(machine: Machine, threadId: string): Promise<RemoteThreadStatus> {
    return parseJson(await sshDaemon(machine, ["status", threadId]));
  }

  async pause(machine: Machine, threadId: string): Promise<boolean> {
    const res = await sshDaemon(machine, ["pause", threadId]);
    return res.code === 0;
  }

  async start(machine: Machine, threadId: string): Promise<boolean> {
    const res = await sshDaemon(machine, ["start", threadId]);
    return res.code === 0;
  }

  async checkpoint(machine: Machine, threadId: string): Promise<{ sha: string | null; pushed: boolean }> {
    return parseJson(await sshDaemon(machine, ["checkpoint", threadId]));
  }

  async ensureWorktree(machine: Machine, threadId: string): Promise<{ workspacePath: string | null }> {
    return parseJson(await sshDaemon(machine, ["worktree", threadId]));
  }

  async logs(machine: Machine, threadId: string, lines?: number): Promise<string> {
    const args = ["logs", threadId];
    if (lines !== undefined) args.push(String(lines));
    const res = await sshDaemon(machine, args);
    return res.code === 0 ? res.stdout : `# peer logs unavailable (exit ${res.code})`;
  }

  async recoveryBranch(machine: Machine, threadId: string): Promise<string | null> {
    return parseJson(await sshDaemon(machine, ["recovery", threadId]));
  }

  async importThread(machine: Machine, thread: HandoffThread): Promise<boolean> {
    const res = await sshDaemon(machine, ["import", thread.id, JSON.stringify(thread)]);
    return res.code === 0;
  }
}

/**
 * LocalTransport: when the "peer" is this machine (same registry + repo). Used
 * for same-host threads and for tests — it defers to the local log file and
 * short-circuits RPC. Mutations are intentionally NOT reimplemented here; the
 * `HandoffService` always performs local mutations directly and only reaches
 * the transport for genuinely remote machines.
 */
export class LocalTransport implements RemoteTransport {
  private root: string;
  constructor(root: string) {
    this.root = root;
  }

  async ping(): Promise<boolean> {
    return true;
  }
  async threadStatus(): Promise<RemoteThreadStatus> {
    // Local status is read directly by HandoffService; this is a fallback.
    throw new Error("use local status path");
  }
  async pause(): Promise<boolean> {
    return true;
  }
  async start(): Promise<boolean> {
    return true;
  }
  async checkpoint(): Promise<{ sha: string | null; pushed: boolean }> {
    return { sha: null, pushed: false };
  }
  async ensureWorktree(): Promise<{ workspacePath: string | null }> {
    return { workspacePath: null };
  }
  async logs(machine: Machine, threadId: string, lines?: number): Promise<string> {
    return readLog(logPath(this.root, threadId), lines);
  }
  async recoveryBranch(): Promise<string | null> {
    return null;
  }
  async importThread(): Promise<boolean> {
    return true;
  }
}
