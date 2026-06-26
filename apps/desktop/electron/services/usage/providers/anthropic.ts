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
      const res = await fetch(USAGE_URL, {
        headers: { Authorization: `Bearer ${cred.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) {
        return { summary: null, state: "unknown", note: "Anthropic token rejected — re-run pi login." };
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
