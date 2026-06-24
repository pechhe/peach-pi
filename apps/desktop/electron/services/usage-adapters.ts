import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  UsageBalanceSummary,
  UsageMetric,
  UsageQuotaSummary,
  UsageWindow,
} from "@peach-pi/shared-types";

import { isConfigValueConfigured, resolveConfigValueOrThrow } from "./resolve-config-value.ts";
import {
  FETCH_TIMEOUT_MS,
  failureNote,
  type FetchResult,
  type UsageAdapter,
} from "./usage-shared.ts";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const MODELS_PATH = join(AGENT_DIR, "models.json");

// ── credential access ───────────────────────────────────────────────────
// Provider API keys live in ~/.pi/agent/models.json providers.<id>.apiKey
// (plaintext JSON, local-first single-user). Raw keys never cross to the
// renderer; adapters read them here to make authenticated quota calls.

interface ModelsFile {
  providers?: Record<string, ProviderEntry>;
}
interface ProviderEntry {
  apiKey?: string;
  baseUrl?: string;
}

function readModels(): ModelsFile {
  try {
    return JSON.parse(readFileSync(MODELS_PATH, "utf8")) as ModelsFile;
  } catch {
    return {};
  }
}

function rawApiKey(id: string): string | undefined {
  return readModels().providers?.[id]?.apiKey;
}

/** Resolve (and execute/interpolate) a provider's apiKey: `!cmd`, `$VAR`, or literal. */
function apiKeyFor(id: string): string {
  return resolveConfigValueOrThrow(rawApiKey(id), `API key for provider "${id}"`);
}

/** Configured WITHOUT executing shell commands — for the cheap `configured()` probe. */
export function hasApiKey(id: string): boolean {
  return isConfigValueConfigured(rawApiKey(id));
}

// ── shared helpers ──────────────────────────────────────────────────────

function clampPct(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function isoFromMs(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await safeBody(res)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

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

function asFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

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
  return { usedPct, resetAt: isoFromMs(l.nextResetTime) };
}

/** Pull the `limits[]` out of a raw Z.ai monitor response, tolerating both the
 *  documented `{data:{limits}}` envelope and a bare `{limits}` shape. */
export function extractZaiLimits(body: unknown): ZaiLimit[] {
  if (typeof body !== "object" || body === null) return [];
  const b = body as ZaiQuotaResponse;
  const limits = b?.data?.limits ?? b?.limits;
  return Array.isArray(limits) ? limits : [];
}

export class ZaiAdapter implements UsageAdapter {
  label = "Z.ai · GLM Coding Plan";
  async configured(): Promise<boolean> {
    return hasApiKey("zai");
  }
  async fetch(): Promise<FetchResult> {
    const apiKey = apiKeyFor("zai");
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

export class OpenRouterAdapter implements UsageAdapter {
  label = "OpenRouter";
  async configured(): Promise<boolean> {
    return hasApiKey("openrouter");
  }
  async fetch(): Promise<FetchResult> {
    const apiKey = apiKeyFor("openrouter");
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

// ── NeuralWatt (pay-per-token, energy-based) ────────────────────────────────
// GET /v1/quota → { balance: { credits_remaining_usd, total_credits_usd,
//   credits_used_usd }, usage: { current_month: { cost_usd, requests, tokens,
//   energy_kwh } } }. Flat $5/kWh pricing across all models.

interface NwQuota {
  balance?: { credits_remaining_usd?: number; total_credits_usd?: number; credits_used_usd?: number };
  usage?: { current_month?: { cost_usd?: number; requests?: number; tokens?: number; energy_kwh?: number } };
}

export class NeuralWattAdapter implements UsageAdapter {
  label = "NeuralWatt · Energy Billing";
  async configured(): Promise<boolean> {
    return hasApiKey("neuralwatt");
  }
  async fetch(): Promise<FetchResult> {
    const apiKey = apiKeyFor("neuralwatt");
    try {
      const data = (await fetchJson("https://api.neuralwatt.com/v1/quota", {
        Authorization: `Bearer ${apiKey}`,
      })) as NwQuota;
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
        kind: "balance", balanceUSD, spentDay: null, spentWeek: null, spentMonth, extra,
      };
      return { summary, state: "ok", note: null };
    } catch (e) {
      return { summary: null, state: "unknown", note: failureNote(e) };
    }
  }
}

// ── Anthropic adapter lives in usage-anthropic-adapter.ts (uses OAuth, not
//    HTTP), and the provider→adapter registry lives in usage-service.ts.
