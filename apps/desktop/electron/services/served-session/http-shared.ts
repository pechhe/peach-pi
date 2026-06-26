import type { IncomingMessage } from "node:http";

/** Default fetch timeout for `fetchJsonWithTimeout` (10 s). Matches the former
 *  `FETCH_TIMEOUT_MS` in `usage-shared.ts`; lives here now so the consolidated
 *  fetch helper owns its own default without a back-dependency on the usage
 *  module. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Consolidated HTTP helpers for the served-session seam (ADR-0012). Four+
 * fetch/JSON-with-timeout variants existed across `usage-adapters.ts`,
 * `usage-mimo-adapter.ts`, `usage-anthropic-adapter.ts`, raw-`http.request`
 * `getJson`/`postJson` in the old `remote-client.ts`, `readJsonBody` in the
 * old `remote-host.ts`, and a capless `readJson` in `connector-resolver.ts`.
 * They collapse into two helpers here:
 *
 *  - `fetchJsonWithTimeout` — the fetch family (usage adapters + any fetch
 *    caller). Replaces the duplicated AbortController+timer pattern.
 *  - `readJsonBody` — `node:http` `IncomingMessage` bodies. Replaces the relay's
 *    body reader + the connector-resolver reader (capped).
 *
 * The sync file-based `readJson` in `pi-health.ts` stays — different concept,
 *  name clash only.
 */

/**
 * Fetch a URL and parse JSON with a mandatory timeout. The `timeoutMs` is
 * mandatory (via the shared default `FETCH_TIMEOUT_MS` when omitted) so a
 * silent hang can't creep back in on the fetch path. Throws a readable error
 * on non-2xx or an abort.
 */
export async function fetchJsonWithTimeout(
  url: string,
  opts: {
    headers?: Record<string, string>;
    /** Mandatory in spirit; defaults to the shared usage fetch timeout. */
    timeoutMs?: number;
    method?: string;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const { headers, method, body } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await safeBody(res)}`);
  return res.json();
}

/** Surface a max-120-char snippet of the response body for error messages. */
async function safeBody(res: Response): Promise<string> {
  try {
    const t = await res.text();
    // Many APIs return {"error":{"message":...}} — surface the message.
    const j = JSON.parse(t);
    return (j?.error?.message ?? j?.msg ?? t.slice(0, 120)).toString();
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Read a small JSON request body off a `node:http` `IncomingMessage`. Returns
 * `{}` on empty / malformed input so route handlers can treat missing fields
 * uniformly. Caps at `maxBytes` (default 64 KiB — prompts are text, not
 * uploads) so a hostile or runaway client can't exhaust the relay's memory.
 */
export async function readJsonBody(
  req: IncomingMessage,
  opts: { maxBytes?: number } = {},
): Promise<Record<string, unknown>> {
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) break;
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
