import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { appendLog } from "./logs.ts";

/**
 * Worker process runner. Each thread launches one detached process whose
 * stdout/stderr are tee'd to the thread log. The MVP does NOT migrate live
 * process memory — handoff pauses/stops, then start/resume relaunches the
 * command on the new owner. The command itself is configurable (default: a
 * `pi` invocation), so this layer stays agnostic to the agent runtime.
 */

export interface StartedProcess {
  pid: number;
  logPath: string;
}

/** Launch `command` detached, streaming output to `logPath`. Resolves with the
 *  pid once the process has spawned (it keeps running in the background). */
export async function startWorker(
  command: string,
  logPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StartedProcess> {
  await mkdir(dirname(logPath), { recursive: true });
  const logFd = await open(logPath, "a");
  const child = spawn(command, {
    cwd,
    env: { ...env, PEACH_THREAD: "1" },
    stdio: ["ignore", logFd.fd, logFd.fd],
    detached: true,
    shell: true,
  });
  child.unref();
  // Write a header line so the log is never empty/puzzling on first read.
  await appendLog(logPath, `\n# peach worker started: ${command} (pid ${child.pid})\n`);
  await logFd.close();
  if (typeof child.pid !== "number") throw new Error("failed to spawn worker");
  return { pid: child.pid, logPath };
}

/** Send a process a signal (default SIGTERM). No-op if pid is null. */
export function stopWorker(pid: number | null, signal: NodeJS.Signals = "SIGTERM"): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}
