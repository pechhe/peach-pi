import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Disk-backed last-good snapshot for stale-while-revalidate. Lets the
 * Connectors / BWS views open instantly (seed from disk, refresh in the
 * background) and stay readable offline (serve the snapshot when the network
 * read fails).
 *
 * NON-SECRET metadata only — connection lists, the toolkit catalogue, BWS
 * status, and secret *key names* (values redacted). Secret VALUES are never
 * written here; offline you can list keys but must reconnect to reveal a value.
 *
 * Loaded synchronously once in the constructor; written atomically at 0600
 * (same posture as the sibling token files in `~/.pi/agent`). Write failures
 * are swallowed — a missing cache just means a slower next open.
 */
export class DiskCache<T> {
  private value: T | undefined;

  constructor(private file: string) {
    try {
      this.value = JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      this.value = undefined;
    }
  }

  get(): T | undefined {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // Best-effort: a failed write only costs a slower/offline-blank next open.
    }
  }
}

/** True for errors that mean "couldn't reach the network", so callers can serve
 *  a cached snapshot or surface a clear offline message instead of a raw stack.
 *  Matches both Node socket codes (Composio SDK / fetch) and `bws` CLI stderr. */
export function isOfflineError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const code =
    (e as { code?: string })?.code ??
    (e as { cause?: { code?: string } })?.cause?.code ??
    "";
  if (
    ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ENETUNREACH"].includes(
      code,
    )
  ) {
    return true;
  }
  return /enotfound|econnrefused|eai_again|etimedout|econnreset|enetunreach|network|fetch failed|getaddrinfo|dns|error sending request|request for url|failed to lookup|temporary failure|unreachable|offline/.test(
    msg,
  );
}
