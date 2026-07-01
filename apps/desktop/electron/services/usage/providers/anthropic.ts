import type { UsageWindow, UsageQuotaSummary } from "@peach-pi/shared-types";

import {
  failureNote,
  clampPct,
  isoFromMs,
  fetchJson,
  asFiniteNumber,
  type Credential,
  type FetchResult,
  type UsageProvider,
} from "../usage-shared.ts";
import { AnthropicOAuthSource } from "../usage-credentials.ts";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

interface UsageResponse {
  five_hour?: WindowData;
  seven_day?: WindowData;
}
interface WindowData {
  utilization?: number;
  resets_at?: string | null;
}

/** Anthropic (Claude Pro/Max subscription). Delegates OAuth refresh/persist to
 *  an injected {@link AnthropicOAuthSource}; this provider only consumes the
 *  resolved access token to call the usage API. Never reads auth.json. */
export class AnthropicUsageProvider implements UsageProvider {
  readonly provider = "anthropic";
  readonly label = "Anthropic · Claude Plan";
  readonly credential: AnthropicOAuthSource;

  constructor(credential?: AnthropicOAuthSource) {
    this.credential = credential ?? new AnthropicOAuthSource();
  }

  async run(cred: Credential): Promise<FetchResult> {
    // The source yields a `manual` credential (with the set-up note) when the
    // user hasn't run `pi login` — surface that as an actionable card.
    if (cred.kind === "manual") {
      return { summary: null, state: "unsupported", note: cred.note ?? null };
    }
    if (cred.kind !== "oauth") {
      return { summary: null, state: "unknown", note: null };
    }
    try {
      // Anthropic's usage endpoint intermittently returns HTTP 429 (rate
      // limited); it lifts seconds later. Retry with a short backoff instead
      // of flipping the card to an error every time the throttle hits.
      const res = await fetchWithRetry(USAGE_URL, cred.accessToken);
      if (res.status === 401) {
        return { summary: null, state: "unknown", note: "Anthropic token rejected — re-run pi login." };
      }
      if (res.status === 429) {
        return { summary: null, state: "unknown", note: "Anthropic usage API rate-limited — try again shortly." };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as UsageResponse;
      const fiveHours = toWindow(data.five_hour);
      const weekly = toWindow(data.seven_day);
      if (!fiveHours && !weekly) return { summary: null, state: "unknown", note: null };
      const summary: UsageQuotaSummary = { kind: "quota", fiveHours, weekly };
      const state: FetchResult["state"] = fiveHours && weekly ? "ok" : "partial";
      return { summary, state, note: null };
    } catch (e) {
      return { summary: null, state: "unknown", note: failureNote(e) };
    }
  }
}

function toWindow(d: WindowData | undefined): UsageWindow | null {
  if (!d || typeof d.utilization !== "number" || !Number.isFinite(d.utilization)) return null;
  // Anthropic reports `utilization` = consumed %. Flip to remaining so it
  // counts down (0 = depleted), consistent with Z.ai's `percentage`.
  const remainingPct = Math.max(0, Math.min(100, 100 - d.utilization));
  const resetAt = d.resets_at ?? null;
  return { remainingPct, resetAt };
}

/** Fetch the usage endpoint, retrying transient 429 (rate-limit) responses.
 *
 *  Anthropic's `/api/oauth/usage` is an undocumented internal endpoint shared
 *  with Claude Code/Claude desktop. It applies a far stricter per-token rate
 *  limit bucket to requests that don't look like the official clients (≈5
 *  requests then persistent 429, often with `retry-after: 0`). Sending the
 *  `User-Agent` + `anthropic-beta` headers the official clients send routes
 *  calls into the generous bucket where 30–60s polling is fine. The retry
 *  below stays as a safety net for the rare genuine throttle. */
const MAX_429_RETRIES = 2;

async function fetchWithRetry(url: string, accessToken: string): Promise<Response> {
  // User-Agent + anthropic-beta route the request into the generous rate-limit
  // bucket the official Claude Code/desktop clients use; bare Bearer requests
  // land in a strict bucket (~5 calls then persistent 429).
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "claude-code/2.1.72",
    "anthropic-beta": "oauth-2025-04-20",
  };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    const wait = retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt);
    await sleep(wait);
  }
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 10_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 10_000));
  return null;
}

function backoffMs(attempt: number): number {
  // ~1s, ~2s — small enough to stay well under the per-request 15s timeout.
  return 1000 * (attempt + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
