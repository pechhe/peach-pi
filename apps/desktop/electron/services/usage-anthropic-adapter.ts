import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { UsageQuotaSummary, UsageWindow } from "@peach-pi/shared-types";

import { failureNote, type FetchResult, type UsageAdapter } from "./usage-shared.ts";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const AUTH_PATH = join(AGENT_DIR, "auth.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

// ── Anthropic (Claude Pro/Max subscription) ──────────────────────────────
// Reads the OAuth token pi stores in ~/.pi/agent/auth.json under `anthropic`
// (the same token Claude Code / the pi agent uses for inference). That token
// exposes subscription quota directly via GET /api/oauth/usage — no
// claude.ai cookie scrape, no pi-quota-status extension required.
//
// Refresh flow mirrors pi-ai's `refreshAnthropicToken`: POST the refresh_token
// to platform.claude.com, persist the new access/refresh/expiry back to
// auth.json (so pi also benefits), with the same 5-minute safety margin.

interface AuthFile {
  anthropic?: AnthropicCreds;
  [k: string]: unknown;
}
interface AnthropicCreds {
  type?: string;
  access?: string;
  refresh?: string;
  expires?: number;
}
interface UsageResponse {
  five_hour?: WindowData;
  seven_day?: WindowData;
}
interface WindowData {
  utilization?: number;
  resets_at?: string | null;
}
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function readAuth(): AuthFile {
  try {
    return JSON.parse(readFileSync(AUTH_PATH, "utf8")) as AuthFile;
  } catch {
    return {};
  }
}

/** Refresh an expired/soon-to-expire access token; persist back to auth.json. */
async function maybeRefresh(creds: AnthropicCreds): Promise<string> {
  // Refresh if within 5 minutes of expiry (pi's margin) or already expired.
  if (creds.access && creds.expires && Date.now() < creds.expires - 5 * 60_000) {
    return creds.access;
  }
  if (!creds.refresh) {
    throw new Error("No refresh token to renew the expired Anthropic access token — re-run pi login.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: creds.refresh }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status}`);
  const data = (await res.json()) as TokenResponse;
  const access = data.access_token;
  const refresh = data.refresh_token ?? creds.refresh;
  const expires = Date.now() + (data.expires_in ?? 3600) * 1000 - 5 * 60_000;
  if (!access) throw new Error("Token refresh returned no access_token");
  // Persist so pi picks up the refreshed token too (best-effort, non-fatal).
  try {
    const auth = readAuth();
    auth.anthropic = { type: creds.type ?? "oauth", access, refresh, expires };
    writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
  } catch {
    // Persistence is best-effort; we still have the token in memory this call.
  }
  return access;
}

export class AnthropicAdapter implements UsageAdapter {
  label = "Anthropic · Claude Plan";
  async configured(): Promise<boolean> {
    const ac = readAuth().anthropic;
    return !!(ac && ac.type === "oauth" && ac.access && ac.refresh);
  }
  async fetch(): Promise<FetchResult> {
    const creds = readAuth().anthropic;
    if (!creds || creds.type !== "oauth" || !creds.refresh) {
      return {
        summary: null,
        state: "unsupported",
        note: "Run `pi login` with the Anthropic provider to enable Claude Plan usage.",
      };
    }
    try {
      const accessToken = await maybeRefresh(creds);
      const res = await fetch(USAGE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
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
