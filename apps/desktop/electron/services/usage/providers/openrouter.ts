import type {
  UsageBalanceSummary,
  UsageMetric,
} from "@peach-pi/shared-types";

import {
  failureNote,
  fetchJson,
  asFiniteNumber,
  type Credential,
  type FetchResult,
  type UsageProvider,
} from "../usage-shared.ts";
import { ModelsApiKeySource } from "../usage-credentials.ts";

// ── OpenRouter (pay-per-token credits) ───────────────────────────────────
// GET /api/v1/credits → { data: { total_credits, total_usage } }. GET /api/v1/key →
// { data: { limit, limit_remaining, usage, usage_daily/weekly/monthly } }.
// Both responses wrap their payload under a `data` envelope.

interface OrCredits { total_credits?: number; total_usage?: number }
interface OrKeyData {
  limit?: number | null; limit_remaining?: number | null; usage?: number;
  usage_daily?: number; usage_weekly?: number; usage_monthly?: number;
}
interface OrCreditsResponse { data?: OrCredits }
interface OrKeyResponse { data?: OrKeyData }

export class OpenRouterUsageProvider implements UsageProvider {
  readonly provider = "openrouter";
  readonly label = "OpenRouter";
  readonly credential: ModelsApiKeySource;

  constructor(credential?: ModelsApiKeySource) {
    this.credential = credential ?? new ModelsApiKeySource("openrouter");
  }

  async run(cred: Credential): Promise<FetchResult> {
    if (cred.kind !== "api-key") return { summary: null, state: "unknown", note: null };
    const apiKey = cred.value;
    try {
      const headers = { Authorization: `Bearer ${apiKey}` };
      // Only /credits is needed for the headline balance; /key adds spend detail.
      const creditsResp = (await fetchJson("https://openrouter.ai/api/v1/credits", headers)) as OrCreditsResponse;
      const credits = creditsResp?.data;
      const balance = asFiniteNumber(credits?.total_credits);
      const totalUsed = asFiniteNumber(credits?.total_usage);
      let spentDay: number | null = null;
      let spentWeek: number | null = null;
      let spentMonth: number | null = null;
      try {
        const key = (await fetchJson("https://openrouter.ai/api/v1/key", headers)) as OrKeyResponse;
        const d = key?.data;
        spentDay = asFiniteNumber(d?.usage_daily);
        spentWeek = asFiniteNumber(d?.usage_weekly);
        spentMonth = asFiniteNumber(d?.usage_monthly);
      } catch {
        // /key is optional — balance alone is enough.
      }
      if (balance === null) return { summary: null, state: "unknown", note: null };
      const extra: UsageMetric[] =
        totalUsed !== null ? [{ label: "Total used (all time)", value: `$${totalUsed.toFixed(2)}` }] : [];
      const summary: UsageBalanceSummary = {
        kind: "balance",
        balanceUSD: balance,
        spentDay, spentWeek, spentMonth, extra,
      };
      const partial = spentDay === null && spentWeek === null && spentMonth === null;
      return { summary, state: partial ? "partial" : "ok", note: null };
    } catch (e) {
      return { summary: null, state: "unknown", note: failureNote(e) };
    }
  }
}
