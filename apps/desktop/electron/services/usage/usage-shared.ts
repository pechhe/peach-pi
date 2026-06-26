import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/** Shared between all usage providers + the service. */

export const FETCH_TIMEOUT_MS = 10_000;

/** A resolved credential handed to a provider's fetch logic. The provider
 *  never touches `models.json` / `auth.json` — it consumes this. */
export type Credential =
  | { kind: "api-key"; value: string; baseUrl?: string }
  | { kind: "oauth"; accessToken: string; refreshToken?: string; expiresAt?: number }
  | { kind: "manual"; note: string };

/** Knows WHERE a provider's credentials live and HOW to read/refresh them.
 *  The single seam between storage (models.json / auth.json / none) and the
 *  fetch providers. Providers never read those files directly. */
export interface CredentialSource {
  /** Provider id, matching models.json / auth.json keys. */
  readonly provider: string;
  /** Credential kind, for diagnostics. */
  readonly kind: "api-key" | "oauth" | "manual";
  /** Cheap probe — no shell exec, no network. Mirrors isConfigValueConfigured(). */
  configured(): Promise<boolean>;
  /** Resolve a usable credential, refreshing tokens / running `!cmd` as needed.
   *  Throws when resolution fails (same errors as resolveConfigValueOrThrow).
   *  `manual` sources return `{ kind: "manual", note }`. */
  resolve(): Promise<Credential>;
}

/** One card per provider. Composes a CredentialSource and owns the fetch +
 *  note/dashboard text. The service only iterates providers and calls run(). */
export interface UsageProvider {
  readonly provider: string;
  readonly label: string;
  /** Credential source this provider reads from (injected, swappable). */
  readonly credential: CredentialSource;
  /** Turn a resolved credential into a usage result. The provider never
   *  touches models.json/auth.json — it consumes `cred`. */
  run(cred: Credential): Promise<FetchResult>;
  /** Dashboard-only link (state "manual"); optional. */
  dashboardUrl?(): string;
}

export type FetchResult = {
  summary: ProviderUsageSummary["summary"];
  state: ProviderUsageSummary["state"];
  note: string | null;
};

/** Short, non-sensitive note from a fetch failure (no key ever included). */
export function failureNote(e: unknown): string {
  if (e instanceof Error && e.message) return `Fetch failed: ${e.message.slice(0, 140)}`;
  return "Fetch failed — check your network and key.";
}

// ── shared HTTP / shaping helpers (no provider owns these) ─────────────

export function clampPct(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

export function isoFromMs(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
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

export function asFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
