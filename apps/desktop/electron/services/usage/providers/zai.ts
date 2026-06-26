import type {
  UsageQuotaSummary,
  UsageWindow,
} from "@peach-pi/shared-types";

import {
  failureNote,
  clampPct,
  isoFromMs,
  fetchJson,
  type Credential,
  type FetchResult,
  type UsageProvider,
} from "../usage-shared.ts";
import { ModelsApiKeySource } from "../usage-credentials.ts";

// ── Z.ai (GLM Coding Plan) ───────────────────────────────────────────────
// Subscription quota via the monitor API (undocumented; inferred from the
// `pi-glm-usage` / `opencode-glm-quota` community plugins). Auth header is the
// raw API key with NO "Bearer" prefix. Returns a `limits[]` where a 5-hour
// window is {type:"TOKENS_LIMIT",unit:3,number:5} and weekly is {unit:6,number:1}.

export interface ZaiLimit {
  type?: string;
  unit?: number;
  number?: number;
  percentage?: number;
  nextResetTime?: number;
}
interface ZaiQuotaResponse {
  code?: number;
  data?: { limits?: ZaiLimit[] };
  /** Some responses omit the `data` envelope and inline `limits` directly. */
  limits?: ZaiLimit[];
}

export function isFiveHour(l: ZaiLimit): boolean {
  if (l.type === "TOKENS_LIMIT" && l.unit === 3 && l.number === 5) return true;
  return l.type === "Token usage(5 Hour)";
}
export function isWeekly(l: ZaiLimit): boolean {
  if (l.type === "TOKENS_LIMIT" && l.unit === 6 && l.number === 1) return true;
  return l.type === "Token usage(Weekly)";
}

export function zaiWindow(l: ZaiLimit | undefined): UsageWindow | null {
  if (!l) return null;
  const usedPct = clampPct(l.percentage);
  if (usedPct === null) return null;
  // Z.ai reports `percentage` = consumed %. Flip to remaining so it counts
  // down (0 = depleted), matching the Anthropic provider.
  const remainingPct = 100 - usedPct;
  return { remainingPct, resetAt: isoFromMs(l.nextResetTime) };
}

/** Pull the `limits[]` out of a raw Z.ai monitor response, tolerating both the
 *  documented `{data:{limits}}` envelope and a bare `{limits}` shape. */
export function extractZaiLimits(body: unknown): ZaiLimit[] {
  if (typeof body !== "object" || body === null) return [];
  const b = body as ZaiQuotaResponse;
  const limits = b?.data?.limits ?? b?.limits;
  return Array.isArray(limits) ? limits : [];
}

export class ZaiUsageProvider implements UsageProvider {
  readonly provider = "zai";
  readonly label = "Z.ai · GLM Coding Plan";
  readonly credential: ModelsApiKeySource;

  constructor(credential?: ModelsApiKeySource) {
    this.credential = credential ?? new ModelsApiKeySource("zai");
  }

  async run(cred: Credential): Promise<FetchResult> {
    if (cred.kind !== "api-key") return { summary: null, state: "unknown", note: null };
    const apiKey = cred.value;
    try {
      const data = (await fetchJson("https://api.z.ai/api/monitor/usage/quota/limit", {
        Authorization: apiKey, // raw key, no Bearer
        "Accept-Language": "en-US,en",
        "Content-Type": "application/json",
      })) as ZaiQuotaResponse;
      const limits = extractZaiLimits(data);
      const fiveHours = zaiWindow(limits.find(isFiveHour));
      const weekly = zaiWindow(limits.find(isWeekly));
      if (!fiveHours && !weekly) return { summary: null, state: "unknown", note: null };
      const summary: UsageQuotaSummary = { kind: "quota", fiveHours, weekly };
      return { summary, state: fiveHours && weekly ? "ok" : "partial", note: null };
    } catch (e) {
      return { summary: null, state: "unknown", note: failureNote(e) };
    }
  }
}
