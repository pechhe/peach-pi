import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Per-thread log files live under the peach root so the path is predictable
 * from the thread id alone — no registry lookup needed to tail a log.
 *
 * Logs are written by the owning machine's worker process and read back by
 * `peach logs`, either locally (when this machine owns the thread) or via the
 * transport (polling the peer). True streaming is a future improvement.
 */

export function logPath(root: string, threadId: string): string {
  return `${root}/logs/${threadId}.log`;
}

/** Append a chunk to a thread log, creating dirs as needed. */
export async function appendLog(path: string, chunk: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, chunk, "utf8");
}

/** Read the last `lines` lines (or all) of a thread log; "" if absent. */
export async function readLog(path: string, lines?: number): Promise<string> {
  let data: string;
  try {
    data = await readFile(path, "utf8");
  } catch {
    // Caller distinguishes "no log yet" from empty log by returning "".
    return "";
  }
  if (lines === undefined || lines <= 0) return data;
  const all = data.split("\n");
  // Drop a trailing newline's empty element so tail counts match intuition.
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  return all.slice(-lines).join("\n");
}

/** Whether a log file exists (non-throwing). */
export async function logExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
