import type { IncomingMessage } from "node:http";

/**
 * Consolidated HTTP helpers for the served-session seam (ADR-0012). Four+
 * fetch/JSON-with-timeout variants existed across `usage-adapters.ts`,
 * `usage-mimo-adapter.ts`, `usage-anthropic-adapter.ts`, raw-`http.request`
 * `getJson`/`postJson` in the old `remote-client.ts`, `readJsonBody` in the
 * old `remote-host.ts`, and a capless `readJson` in `connector-resolver.ts`.
 * They collapse into one helper here:
 *
 *  - `readJsonBody` — `node:http` `IncomingMessage` bodies. Replaces the relay's
 *    body reader + the connector-resolver reader (capped).
 *
 * The sync file-based `readJson` in `pi-health.ts` stays — different concept,
 *  name clash only.
 */

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
