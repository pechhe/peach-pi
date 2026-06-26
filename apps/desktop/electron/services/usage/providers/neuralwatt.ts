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

// ── NeuralWatt (pay-per-token, energy-based) ────────────────────────────
// GET /v1/quota → { balance: { credits_remaining_usd, total_credits_usd,
//   credits_used_usd }, usage: { current_month: { cost_usd, requests, tokens,
//   energy_kwh } } }. Flat $5/kWh pricing across all models.

interface NwQuota {
  balance?: { credits_remaining_usd?: number; total_credits_usd?: number; credits_used_usd?: number };
  usage?: { current_month?: { cost_usd?: number; requests?: number; tokens?: number; energy_kwh?: number } };
}
interface NwEnergyDaily { date?: string; energy_kwh?: number }
interface NwEnergy { totals?: { requests?: number; energy_kwh?: number }; daily?: NwEnergyDaily[] }

/** Flat $/kWh rate NeuralWatt bills across all models. */
const NW_USD_PER_KWH = 5;

/** today's energy in kWh, matched on UTC date (NeuralWatt dates are UTC days). */
function nwTodayKwh(daily: NwEnergyDaily[] | undefined): number | null {
  if (!Array.isArray(daily) || daily.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const row = daily.find((d) => d?.date === today);
  return asFiniteNumber(row?.energy_kwh);
}

export class NeuralWattUsageProvider implements UsageProvider {
  readonly provider = "neuralwatt";
  readonly label = "NeuralWatt · Energy Billing";
  readonly credential: ModelsApiKeySource;

  constructor(credential?: ModelsApiKeySource) {
    this.credential = credential ?? new ModelsApiKeySource("neuralwatt");
  }

  async run(cred: Credential): Promise<FetchResult> {
    if (cred.kind !== "api-key") return { summary: null, state: "unknown", note: null };
    const apiKey = cred.value;
    try {
      const headers = { Authorization: `Bearer ${apiKey}` };
      const data = (await fetchJson("https://api.neuralwatt.com/v1/quota", headers)) as NwQuota;
      // /usage/energy gives per-day kWh; today's row × flat $/kWh = today's spend.
      let spentDay: number | null = null;
      try {
        const energy = (await fetchJson("https://api.neuralwatt.com/v1/usage/energy", headers)) as NwEnergy;
        const todayKwh = nwTodayKwh(energy?.daily);
        if (todayKwh !== null) spentDay = todayKwh * NW_USD_PER_KWH;
      } catch {
        // /usage/energy is optional — balance + month cost still surface.
      }
      const bal = data?.balance ?? {};
      const mo = data?.usage?.current_month ?? {};
      const balanceUSD = asFiniteNumber(bal.credits_remaining_usd);
      const spentMonth = asFiniteNumber(mo.cost_usd);
      const reqs = asFiniteNumber(mo.requests);
      const kwh = asFiniteNumber(mo.energy_kwh);
      const totalCredits = asFiniteNumber(bal.total_credits_usd);
      const extra: UsageMetric[] = [];
      if (kwh !== null) extra.push({ label: "Energy (this month)", value: `${kwh.toFixed(4)} kWh` });
      if (reqs !== null) extra.push({ label: "Requests (this month)", value: `${reqs.toLocaleString()} reqs` });
      if (totalCredits !== null) extra.push({ label: "Total credits", value: `$${totalCredits.toFixed(2)}` });
      const summary: UsageBalanceSummary = {
        kind: "balance", balanceUSD, spentDay, spentWeek: null, spentMonth, extra,
      };
      return { summary, state: "ok", note: null };
    } catch (e) {
      return { summary: null, state: "unknown", note: failureNote(e) };
    }
  }
}
