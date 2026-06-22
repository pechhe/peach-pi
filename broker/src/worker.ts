/**
 * peach-pi OAuth broker — a Cloudflare Worker that holds client_secrets for
 * confidential providers (Notion, GitHub, Slack, …) so a distributed desktop
 * app never ships them. It performs the code↔token and refresh exchanges
 * server-side and hands tokens back to the app via a single-use pickup token.
 *
 * Flow:
 *   app → GET /start?provider&app_redirect&state
 *       → 302 to provider consent (redirect_uri = this Worker's /callback)
 *   provider → GET /callback?code&state
 *       → exchange code+secret → tokens → store under pickup → 302 app_redirect?code=<pickup>&state
 *   app (deep-link/loopback) → GET /pickup?token=<pickup> → tokens (single use)
 *   app → POST /refresh {provider, refresh_token} → fresh tokens
 *
 * Bindings (wrangler.toml):
 *   KV namespace `OAUTH`        — short-lived state + pickup storage
 *   secrets `<PROVIDER>_CLIENT_ID`, `<PROVIDER>_CLIENT_SECRET` per provider
 *     (uppercased provider, hyphens → underscores, e.g. GOOGLE_DRIVE_CLIENT_ID)
 */

interface Env {
  OAUTH: KVNamespace;
  [secret: string]: unknown;
}

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  /** Notion-style HTTP Basic auth on the token endpoint vs creds in the body. */
  useBasicAuth: boolean;
  /** Default scope (space- or comma-delimited per provider convention). */
  scope: string;
  /** Extra static authorize-URL params (e.g. Notion's owner=user). */
  authParams?: Record<string, string>;
}

// Non-secret per-provider endpoints. client_id/secret come from env.
const PROVIDERS: Record<string, ProviderConfig> = {
  notion: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    useBasicAuth: true,
    scope: "",
    authParams: { owner: "user" },
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    useBasicAuth: false,
    scope: "repo read:user",
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    useBasicAuth: false,
    scope: "channels:read chat:write",
  },
  figma: {
    authorizeUrl: "https://www.figma.com/oauth",
    tokenUrl: "https://api.figma.com/v1/oauth/token",
    useBasicAuth: false,
    scope: "file_read",
  },
  box: {
    authorizeUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    useBasicAuth: false,
    scope: "",
  },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    useBasicAuth: false,
    scope: "crm.objects.contacts.read",
  },
  intercom: {
    authorizeUrl: "https://app.intercom.com/oauth",
    tokenUrl: "https://api.intercom.io/auth/eagle/token",
    useBasicAuth: false,
    scope: "",
  },
  monday: {
    authorizeUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    useBasicAuth: false,
    scope: "me:read boards:read",
  },
};

const STATE_TTL = 600; // seconds the user has to complete consent
const PICKUP_TTL = 120; // seconds the app has to redeem tokens

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const redirect = (location: string): Response => new Response(null, { status: 302, headers: { location } });

const html = (msg: string): Response => new Response(`<!doctype html><body>${msg}</body>`, {
  headers: { "content-type": "text/html" },
});

const envKey = (provider: string) => provider.toUpperCase().replace(/-/g, "_");

function creds(env: Env, provider: string): { id: string; secret: string } {
  const id = env[`${envKey(provider)}_CLIENT_ID`] as string | undefined;
  const secret = env[`${envKey(provider)}_CLIENT_SECRET`] as string | undefined;
  if (!id || !secret) throw new Error(`Missing secrets for ${provider}`);
  return { id, secret };
}

// Only allow bouncing tokens back to the desktop app's own redirects.
function allowedRedirect(target: string): boolean {
  try {
    const u = new URL(target);
    if (u.protocol === "peachpi:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

async function exchangeTokens(
  cfg: ProviderConfig,
  env: Env,
  provider: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { id, secret } = creds(env, provider);
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: string;
  if (cfg.useBasicAuth) {
    headers.Authorization = `Basic ${btoa(`${id}:${secret}`)}`;
    headers["content-type"] = "application/json";
    body = JSON.stringify(params);
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams({ ...params, client_id: id, client_secret: secret }).toString();
  }
  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token exchange ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const selfCallback = `${url.origin}/callback`;

    try {
      if (url.pathname === "/start") {
        const provider = url.searchParams.get("provider") ?? "";
        const appRedirect = url.searchParams.get("app_redirect") ?? "";
        const appState = url.searchParams.get("state") ?? "";
        const cfg = PROVIDERS[provider];
        if (!cfg) return json({ error: "unknown_provider" }, 400);
        if (!allowedRedirect(appRedirect)) return json({ error: "bad_redirect" }, 400);

        const brokerState = crypto.randomUUID() + crypto.randomUUID();
        await env.OAUTH.put(
          `state:${brokerState}`,
          JSON.stringify({ provider, appRedirect, appState }),
          { expirationTtl: STATE_TTL },
        );
        const auth = new URL(cfg.authorizeUrl);
        auth.searchParams.set("client_id", creds(env, provider).id);
        auth.searchParams.set("redirect_uri", selfCallback);
        auth.searchParams.set("response_type", "code");
        if (cfg.scope) auth.searchParams.set("scope", cfg.scope);
        for (const [k, v] of Object.entries(cfg.authParams ?? {})) auth.searchParams.set(k, v);
        auth.searchParams.set("state", brokerState);
        return redirect(auth.toString());
      }

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const brokerState = url.searchParams.get("state") ?? "";
        const raw = await env.OAUTH.get(`state:${brokerState}`);
        if (!raw) return html("Session expired. Close this tab and try again.");
        await env.OAUTH.delete(`state:${brokerState}`);
        const { provider, appRedirect, appState } = JSON.parse(raw) as {
          provider: string;
          appRedirect: string;
          appState: string;
        };
        const back = new URL(appRedirect);
        const providerError = url.searchParams.get("error");
        if (providerError || !code) {
          back.searchParams.set("error", providerError ?? "no_code");
          back.searchParams.set("state", appState);
          return redirect(back.toString());
        }
        const cfg = PROVIDERS[provider]!;
        const tokens = await exchangeTokens(cfg, env, provider, {
          grant_type: "authorization_code",
          code,
          redirect_uri: selfCallback,
        });
        const pickup = crypto.randomUUID() + crypto.randomUUID();
        await env.OAUTH.put(`pickup:${pickup}`, JSON.stringify(tokens), { expirationTtl: PICKUP_TTL });
        back.searchParams.set("code", pickup);
        back.searchParams.set("state", appState);
        return redirect(back.toString());
      }

      if (url.pathname === "/pickup") {
        const token = url.searchParams.get("token") ?? "";
        const raw = await env.OAUTH.get(`pickup:${token}`);
        if (!raw) return json({ error: "expired_or_used" }, 404);
        await env.OAUTH.delete(`pickup:${token}`); // single use
        return new Response(raw, { headers: { "content-type": "application/json" } });
      }

      if (url.pathname === "/refresh" && req.method === "POST") {
        const { provider, refresh_token } = (await req.json()) as {
          provider: string;
          refresh_token: string;
        };
        const cfg = PROVIDERS[provider];
        if (!cfg) return json({ error: "unknown_provider" }, 400);
        const tokens = await exchangeTokens(cfg, env, provider, {
          grant_type: "refresh_token",
          refresh_token,
        });
        return json(tokens);
      }

      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
};

// Minimal Cloudflare KV typing so this file is self-contained without
// @cloudflare/workers-types. Replace with the official types if you add them.
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
