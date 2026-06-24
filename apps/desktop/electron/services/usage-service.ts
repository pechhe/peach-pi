import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  ProviderUsageSummary,
  UsageBalanceSummary,
  UsageMetric,
  UsageQuotaSummary,
  UsageWindow,
} from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";
import { KeyedAsyncTtl } from "./ttl-cache.ts";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const AGENT_DIR = join(homedir(), ".pi", "agent");
const MODELS_PATH = join(AGENT_DIR, "models.json");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");
const AUTH_PATH = join(AGENT_DIR, "auth.json");
const QUOTA_STATUS_SPEC = "npm:@mjfuertesf/pi-quota-status";

/** Where the provider API keys live (plaintext JSON, local-first single-user). */
interface ModelsFile {
  providers?: Record<string, ProviderEntry>;
}
interface ProviderEntry {
  apiKey?: string;
  baseUrl?: string;
}

/** A typed adapter turns a provider's credentials into a usage summary. */
interface UsageAdapter {
  label: string;
  /** Whether the agent has configured the provider (key/cookie present). */
  configured(): Promise<boolean>;
  /** Fetch the live usage; returns null summary on unrecoverable failure and
   *  a state explaining why (unsupported / unknown / partial / ok). */
  fetch(): Promise<{ summary: ProviderUsageSummary["summary"]; state: ProviderUsageSummary["state"]; note: string | null }>;
}

// ── credential access ───────────────────────────────────────────────────

function readModels(): ModelsFile {
  try {
    return JSON.parse(readFileSync(MODELS_PATH, "utf8")) as ModelsFile;
  } catch {
    return {};
  }
}

function providerEntry(id: string): ProviderEntry | undefined {
  return readModels().providers?.[id];
}

function apiKeyFor(id: string): string | undefined {
  return providerEntry(id)?.apiKey;
}

// ── shared helpers ──────────────────────────────────────────────────────

/** Clamp a utilization percentage to 0–100. */
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
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

interface ZaiLimit {
  type?: string;
  unit?: number;
  number?: number;
  percentage?: number;
  nextResetTime?: number;
}
interface ZaiQuotaResponse {
  limits?: ZaiLimit[];
}

function isFiveHour(l: ZaiLimit): boolean {
  if (l.type === "TOKENS_LIMIT" && l.unit === 3 && l.number === 5) return true;
  return l.type === "Token usage(5 Hour)";
}
function isWeekly(l: ZaiLimit): boolean {
  if (l.type === "TOKENS_LIMIT" && l.unit === 6 && l.number === 1) return true;
  return l.type === "Token usage(Weekly)";
}

function zaiWindow(l: ZaiLimit | undefined): UsageWindow | null {
  if (!l) return null;
  const usedPct = clampPct(l.percentage);
  if (usedPct === null) return null;
  return { usedPct, resetAt: isoFromMs(l.nextResetTime) };
}

class ZaiAdapter implements UsageAdapter {
  label = "Z.ai · GLM Coding Plan";
  async configured(): Promise<boolean> {
    return !!apiKeyFor("zai");
  }
  async fetch() {
    const apiKey = apiKeyFor("zai");
    if (!apiKey) return { summary: null, state: "unknown", note: "Add a z.ai API key in models.json." };
    try {
      const data = (await fetchJson("https://api.z.ai/api/monitor/usage/quota/limit", {
        Authorization: apiKey, // raw key, no Bearer
        "Accept-Language": "en-US,en",
        "Content-Type": "application/json",
      })) as ZaiQuotaResponse;
      const limits = Array.isArray(data?.limits) ? data.limits : [];
      const fiveHours = zaiWindow(limits.find(isFiveHour));
      const weekly = zaiWindow(limits.find(isWeekly));
      if (!fiveHours && !weekly) return { summary: null, state: "unknown", note: null };
      const summary: UsageQuotaSummary = { kind: "quota", fiveHours, weekly };
      return { summary, state: fiveHours && weekly ? "ok" : "partial", note: null };
    } catch {
      return { summary: null, state: "unknown", note: null };
    }
  }
}

// ── OpenRouter (pay-per-token credits) ───────────────────────────────────
// GET /api/v1/credits → { total_credits, total_usage }. GET /api/v1/key →
// { data: { limit, limit_remaining, usage, usage_daily/weekly/monthly } }.

interface OrCredits { total_credits?: number; total_usage?: number }
interface OrKeyData {
  limit?: number | null; limit_remaining?: number | null; usage?: number;
  usage_daily?: number; usage_weekly?: number; usage_monthly?: number;
}
interface OrKeyResponse { data?: OrKeyData }

class OpenRouterAdapter implements UsageAdapter {
  label = "OpenRouter";
  async configured(): Promise<boolean> {
    return !!apiKeyFor("openrouter");
  }
  async fetch() {
    const apiKey = apiKeyFor("openrouter");
    if (!apiKey) return { summary: null, state: "unknown", note: "Add an OpenRouter API key." };
    try {
      const headers = { Authorization: `Bearer ${apiKey}` };
      // Only /credits is needed for the headline balance; /key adds spend detail.
      const credits = (await fetchJson("https://openrouter.ai/api/v1/credits", headers)) as OrCredits;
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
    } catch {
      return { summary: null, state: "unknown", note: null };
    }
  }
}

// ── NeuralWatt (pay-per-token, energy-based) ────────────────────────────
// GET /v1/usage/energy → { totals: { requests, energy_kwh, energy_joules } }.
// No $ balance from the API; energy + request count are surfaced as metrics.

interface NwEnergy { totals?: { requests?: number; energy_kwh?: number; energy_joules?: number } }

class NeuralWattAdapter implements UsageAdapter {
  label = "NeuralWatt";
  async configured(): Promise<boolean> {
    return !!apiKeyFor("neuralwatt");
  }
  async fetch() {
    const apiKey = apiKeyFor("neuralwatt");
    if (!apiKey) return { summary: null, state: "unknown", note: "Add a NeuralWatt API key." };
    try {
      const data = (await fetchJson("https://api.neuralwatt.com/v1/usage/energy", {
        Authorization: `Bearer ${apiKey}`,
      })) as NwEnergy;
      const totals = data?.totals ?? {};
      const reqs = asFiniteNumber(totals.requests);
      const kwh = asFiniteNumber(totals.energy_kwh);
      const extra: UsageMetric[] = [];
      if (reqs !== null) extra.push({ label: "Requests", value: `${reqs.toLocaleString()} reqs` });
      if (kwh !== null) extra.push({ label: "Energy", value: `${kwh.toFixed(4)} kWh` });
      const summary: UsageBalanceSummary = {
        kind: "balance", balanceUSD: null, spentDay: null, spentWeek: null, spentMonth: null, extra,
      };
      return { summary, state: extra.length > 0 ? "ok" : "unknown", note: null };
    } catch {
      return { summary: null, state: "unknown", note: null };
    }
  }
}

// ── Anthropic (Claude subscription via pi-quota-status extension) ─────────
// Reuses the @mjfuertesf/pi-quota-status extension's cookie-based claude.ai
// usage fetch (no point re-scraping the brittlest provider). It exposes a
// JSON command; we shell out to `pi --print` and parse the normalized result.

interface QuotaStatusUsageResult {
  status: "ok" | "partial" | "unknown" | "unsupported";
  provider: string;
  display?: string;
  usage?: { fiveHour?: { remainingPct?: number; resetAt?: string | null } | null; weekly?: { remainingPct?: number; resetAt?: string | null } | null };
}

function findPiBin(): string {
  const candidates = [
    join(homedir(), ".npm-global", "bin", "pi"),
    join(homedir(), ".local", "bin", "pi"),
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi";
}

/** Cheap on-disk check: extension installed AND cookie saved? No network —
 *  avoids a real quota fetch on every `configured()` probe. */
function anthropicConfigured(): boolean {
  let installed = false;
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as { packages?: unknown[] };
    installed = Array.isArray(parsed.packages) && parsed.packages.some((p) => p === QUOTA_STATUS_SPEC);
  } catch {
    installed = false;
  }
  if (!installed) return false;
  try {
    const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as {
      "quota-status"?: { "anthropic-subscription"?: { authCookie?: string; organizationUuid?: string } };
    };
    const sub = auth?.["quota-status"]?.["anthropic-subscription"];
    return !!(sub?.authCookie && sub?.organizationUuid);
  } catch {
    return false;
  }
}

class AnthropicAdapter implements UsageAdapter {
  label = "Anthropic · Claude Plan";
  async configured(): Promise<boolean> {
    return anthropicConfigured();
  }
  async fetch() {
    if (!anthropicConfigured()) {
      return { summary: null, state: "unsupported", note: "Install pi-quota-status + run /quota-status-extract." };
    }
    try {
      const { stdout } = await execFileAsync(
        findPiBin(),
        ["--print", "--no-session", "--no-context-files", "/quota-status-usage", "--json"],
        { timeout: FETCH_TIMEOUT_MS * 2, maxBuffer: 4 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout) as QuotaStatusUsageResult;
      if (result.status === "unsupported") {
        return { summary: null, state: "unsupported", note: "Install pi-quota-status + run /quota-status-extract." };
      }
      if (result.status === "unknown") {
        return { summary: null, state: "unknown", note: "Re-run /quota-status-extract with a fresh claude.ai HAR." };
      }
      const fh = result.usage?.fiveHour;
      const wk = result.usage?.weekly;
      const fiveHours: UsageWindow | null =
        fh && typeof fh.remainingPct === "number"
          ? { usedPct: 100 - fh.remainingPct, resetAt: fh.resetAt ?? null }
          : null;
      const weekly: UsageWindow | null =
        wk && typeof wk.remainingPct === "number"
          ? { usedPct: 100 - wk.remainingPct, resetAt: wk.resetAt ?? null }
          : null;
      if (!fiveHours && !weekly) return { summary: null, state: "unknown", note: null };
      const summary: UsageQuotaSummary = { kind: "quota", fiveHours, weekly };
      return { summary, state: result.status, note: null };
    } catch {
      return { summary: null, state: "unsupported", note: "Install pi-quota-status + run /quota-status-extract." };
    }
  }
}

// ── service orchestration ────────────────────────────────────────────────

type AdapterCtor = new () => UsageAdapter;
const ADAPTERS: { provider: string; ctor: AdapterCtor }[] = [
  { provider: "anthropic", ctor: AnthropicAdapter },
  { provider: "zai", ctor: ZaiAdapter },
  { provider: "openrouter", ctor: OpenRouterAdapter },
  { provider: "neuralwatt", ctor: NeuralWattAdapter },
];

export class UsageService {
  private cache = new KeyedAsyncTtl<ProviderUsageSummary>(CACHE_TTL_MS);

  constructor(private emit: Emit) {}

  /** All configured providers' summaries (one card each). */
  async list(): Promise<ProviderUsageSummary[]> {
    const summaries = await Promise.all(ADAPTERS.map(({ provider, ctor }) =>
      this.cache.run(provider, () => this.buildSummary(provider, new ctor())),
    ));
    return summaries;
  }

  /** Force a fresh fetch now, bypassing the cache. */
  async refresh(): Promise<ProviderUsageSummary[]> {
    this.cache.clear();
    const summaries = await this.list();
    this.emit("event:usageChanged", undefined);
    return summaries;
  }

  private async buildSummary(provider: string, adapter: UsageAdapter): Promise<ProviderUsageSummary> {
    const configured = await adapter.configured();
    if (!configured) {
      return { provider, label: adapter.label, configured: false, summary: null, state: "unknown", note: null, fetchedAt: null };
    }
    try {
      const result = await adapter.fetch();
      return {
        provider, label: adapter.label, configured: true,
        summary: result.summary, state: result.state, note: result.note,
        fetchedAt: result.summary ? new Date().toISOString() : null,
      };
    } catch {
      return { provider, label: adapter.label, configured: true, summary: null, state: "unknown", note: null, fetchedAt: null };
    }
  }
}
