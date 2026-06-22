import type { TokenResponse } from "./oauth-flow.ts";

/**
 * Client for the peach-pi OAuth broker — a small vendor-hosted service that
 * holds client_secrets for *confidential* providers (Notion, GitHub, Slack, …)
 * which can't ship their secret in a distributed app. The broker performs the
 * code↔token and refresh exchanges server-side; the app only ever sees tokens.
 *
 * See `broker/README.md` for the Worker and deployment.
 *
 * The base URL is non-secret. Bundle it for releases via `PEACH_OAUTH_BROKER`
 * (set at build/run); when unset, confidential providers fall back to the BYO
 * form instead of one-click.
 */
const DEFAULT_BROKER_BASE = ""; // e.g. "https://connectors.peachpi.app" once deployed

export function brokerBase(): string {
  return (process.env.PEACH_OAUTH_BROKER ?? DEFAULT_BROKER_BASE).replace(/\/+$/, "");
}

export function brokerConfigured(): boolean {
  return brokerBase().length > 0;
}

/** The URL the renderer opens to begin a broker-mediated handshake. The broker
 *  redirects to the provider, handles the callback, then bounces back to
 *  `appRedirect?code=<pickup>&state=<state>`. */
export function buildBrokerStartUrl(opts: {
  base: string;
  provider: string;
  appRedirect: string;
  state: string;
}): string {
  const u = new URL(`${opts.base}/start`);
  u.searchParams.set("provider", opts.provider);
  u.searchParams.set("app_redirect", opts.appRedirect);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

async function brokerJson(url: string, init?: RequestInit): Promise<TokenResponse> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Broker ${init?.method ?? "GET"} ${new URL(url).pathname} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Redeem a single-use pickup token for the token set. */
export function brokerPickup(base: string, pickup: string): Promise<TokenResponse> {
  const u = new URL(`${base}/pickup`);
  u.searchParams.set("token", pickup);
  return brokerJson(u.toString());
}

/** Refresh an access token via the broker (it holds the secret). */
export function brokerRefresh(base: string, provider: string, refreshToken: string): Promise<TokenResponse> {
  return brokerJson(`${base}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, refresh_token: refreshToken }),
  });
}
