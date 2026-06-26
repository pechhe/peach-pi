import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isConfigValueConfigured, resolveConfigValueOrThrow } from "../resolve-config-value.ts";
import type { Credential, CredentialSource } from "./usage-shared.ts";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const MODELS_PATH = join(AGENT_DIR, "models.json");
const AUTH_PATH = join(AGENT_DIR, "auth.json");

// ── models.json (API keys) ──────────────────────────────────────────────
// Provider API keys live in ~/.pi/agent/models.json providers.<id>.apiKey
// (plaintext JSON, local-first single-user). Raw keys never cross to the
// renderer; the source reads them here to resolve `!cmd`/`$VAR`/literal.

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

function rawProviderEntry(id: string): ProviderEntry {
  return readModels().providers?.[id] ?? {};
}

/** API-key source backed by `models.json`. The single place HTTP providers
 *  resolve their `!cmd` / `$VAR` / literal API keys — what `hasApiKey` /
 *  `apiKeyFor` used to do inline in `usage-adapters.ts`. */
export class ModelsApiKeySource implements CredentialSource {
  readonly kind = "api-key" as const;

  readonly provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  async configured(): Promise<boolean> {
    return isConfigValueConfigured(rawProviderEntry(this.provider).apiKey);
  }

  async resolve(): Promise<Credential> {
    const entry = rawProviderEntry(this.provider);
    const value = resolveConfigValueOrThrow(entry.apiKey, `API key for provider "${this.provider}"`);
    return { kind: "api-key", value, baseUrl: entry.baseUrl };
  }
}

// ── auth.json (Anthropic OAuth) ─────────────────────────────────────────
// The OAuth access token pi stores in ~/.pi/agent/auth.json under `anthropic`
// (the same token Claude Code / the pi agent uses for inference). Refresh flow
// mirrors pi-ai's `refreshAnthropicToken`: POST the refresh_token to
// platform.claude.com, persist the new access/refresh/expiry back to auth.json
// (so pi also benefits), with the same 5-minute safety margin. This is the
// ONLY place OAuth refresh happens.

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
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

function readAuth(): AuthFile {
  try {
    return JSON.parse(readFileSync(AUTH_PATH, "utf8")) as AuthFile;
  } catch {
    return {};
  }
}

/** Anthropic OAuth source — single owner of `auth.json` read/write + token
 *  refresh. `configured()` is the cheap probe (oauth + access + refresh);
 *  `resolve()` returns a `{ kind: "manual", note }` credential when the user
 *  hasn't logged in (so the provider emits `state: "unsupported"` with the
 *  set-up note), or a live `oauth` access token after refresh-and-persist. */
export class AnthropicOAuthSource implements CredentialSource {
  readonly kind = "oauth" as const;
  readonly provider = "anthropic";

  async configured(): Promise<boolean> {
    const ac = readAuth().anthropic;
    return !!(ac && ac.type === "oauth" && ac.access && ac.refresh);
  }

  async resolve(): Promise<Credential> {
    const creds = readAuth().anthropic;
    if (!creds || creds.type !== "oauth" || !creds.refresh) {
      // Mirrors AnthropicAdapter.fetch()'s unsupported branch — provider surfaces
      // this note; it does not throw so the card shows actionable set-up text.
      return {
        kind: "manual",
        note: "Run `pi login` with the Anthropic provider to enable Claude Plan usage.",
      };
    }
    return {
      kind: "oauth",
      accessToken: await this.maybeRefresh(creds),
      refreshToken: creds.refresh,
      expiresAt: creds.expires,
    };
  }

  /** Refresh an expired/soon-to-expire access token; persist back to auth.json. */
  private async maybeRefresh(creds: AnthropicCreds): Promise<string> {
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
}

// ── null (dashboard-only) ──────────────────────────────────────────────
/** Dashboard-only source for providers whose quota isn't API-readable (MiMo
 *  today). `configured()` probes whether the provider has a key (via
 *  `models.json`); `resolve()` returns a `manual` credential whose `note`
 *  distinguishes "unconfigured" ("Add a …") from "configured but manual"
 *  ("Token Plan quota isn't readable via the API key…"). */
export class NullCredentialSource implements CredentialSource {
  readonly kind = "manual" as const;

  readonly provider: string;
  private readonly unconfiguredNote: string;
  private readonly manualNote: string;

  constructor(
    provider: string,
    unconfiguredNote: string,
    manualNote: string,
  ) {
    this.provider = provider;
    this.unconfiguredNote = unconfiguredNote;
    this.manualNote = manualNote;
  }

  async configured(): Promise<boolean> {
    return isConfigValueConfigured(rawProviderEntry(this.provider).apiKey);
  }

  async resolve(): Promise<Credential> {
    const configured = await this.configured();
    return {
      kind: "manual",
      note: configured ? this.manualNote : this.unconfiguredNote,
    };
  }
}
