import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

/**
 * OAuth 2.1 primitives shared across providers: PKCE generation,
 * authorize-URL building, code-for-token / refresh exchanges, and the
 * callback transport (deep-link scheme OR loopback http://localhost).
 *
 * Pure (no Electron deps) so the crypto + URL shape can be unit-tested.
 * Both `authCode + client_secret` (Notion) and `PKCE S256` (GitHub and
 * most others) are supported via `PkcePair | null`.
 */

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

/** RFC 7636: 43–128 char verifier from the unreserved set, S256 challenge. */
export function generatePkce(): PkcePair {
  const bytes = randomBytes(48);
  const verifier = bytes.toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}

/** Opaque CSRF/state token binding the in-flight handshake to its callback. */
export function randomState(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Build the provider authorize URL the renderer opens in the default browser.
 * PKCE pair omitted for providers that don't support PKCE (e.g. Notion) — the
 * `code_challenge*` params are simply left out.
 */
export function buildAuthorizeUrl(opts: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  pkce: PkcePair | null;
}): string {
  const url = new URL(opts.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  if (opts.scopes.length > 0) url.searchParams.set("scope", opts.scopes.join(" "));
  if (opts.pkce) {
    url.searchParams.set("code_challenge", opts.pkce.challenge);
    url.searchParams.set("code_challenge_method", opts.pkce.method);
  }
  return url.toString();
}

/** Standard OAuth 2.0 token response (RFC 6749 §5.1). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  [extra: string]: unknown;
}

/** Convert an `expires_in` seconds count to an ISO timestamp. */
export function expiryFromTtl(expiresIn: number | undefined, now = Date.now()): string | null {
  if (!expiresIn || expiresIn <= 0) return null;
  return new Date(now + expiresIn * 1000).toISOString();
}

interface ExchangeBase {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** Send client_secret as Basic auth (true, Notion-style) or in the body (false). */
  useBasicAuth?: boolean;
}

/** Exchange an authorization code for a token set. */
export async function exchangeCode(
  opts: ExchangeBase & { code: string; pkce: PkcePair | null },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
  });
  if (opts.pkce) body.set("code_verifier", opts.pkce.verifier);
  if (opts.clientSecret && !opts.useBasicAuth) body.set("client_secret", opts.clientSecret);
  return postToken(opts.tokenUrl, body, opts.clientSecret, opts.useBasicAuth);
}

/** Refresh an expired access token using a stored refresh_token. */
export async function refreshAccessToken(opts: ExchangeBase & { refreshToken: string }): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
  });
  if (opts.clientSecret && !opts.useBasicAuth) body.set("client_secret", opts.clientSecret);
  return postToken(opts.tokenUrl, body, opts.clientSecret, opts.useBasicAuth);
}

async function postToken(
  tokenUrl: string,
  body: URLSearchParams,
  clientSecret: string | undefined,
  useBasicAuth: boolean | undefined,
): Promise<TokenResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (clientSecret && useBasicAuth) {
    // RFC 6749 §2.3.1 + Notion's required pattern.
    headers.Authorization = `Basic ${Buffer.from(`oauth:${clientSecret}`).toString("base64")}`;
  }
  const res = await fetch(tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token endpoint ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(`OAuth token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Detect which callback transport a `redirectUri` needs. Custom schemes
 * (`peachpi://…`) come back via the OS protocol handler; `http://localhost`
 * URIs need a loopback HTTP server spun up just for the one handshake.
 */
export function callbackTransport(redirectUri: string): "deep-link" | "loopback" {
  try {
    return new URL(redirectUri).protocol === "http:" ? "loopback" : "deep-link";
  } catch {
    return "deep-link";
  }
}

/**
 * Parse a `peachpi://oauth/callback?code=…&state=…` URL into state + code,
 * or null if it isn't ours.
 */
export function parseCallbackUrl(
  url: string,
  expectedScheme = "peachpi",
  expectedHost = "oauth",
  expectedPath = "/callback",
): { state: string; code: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${expectedScheme}:`) return null;
  if (parsed.host !== expectedHost) return null;
  if (parsed.pathname !== expectedPath) return null;
  const state = parsed.searchParams.get("state");
  const code = parsed.searchParams.get("code");
  if (!state || !code) return null;
  return { state, code };
}

/** In-flight OAuth handshake state keyed by `state`. main.ts/cb-handler looks up. */
export interface PendingHandshake {
  connectorId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl: string;
  useBasicAuth: boolean;
  pkce: PkcePair | null;
  /** When set, the callback carries a single-use broker pickup token (in the
   *  `code` param) rather than a provider auth code. Refresh routes to the
   *  broker too. */
  broker?: { base: string; provider: string };
}

export class HandshakeRegistry {
  private pending = new Map<string, { handshake: PendingHandshake; loopback?: Server }>();

  register(state: string, handshake: PendingHandshake, loopback?: Server): void {
    // Bound growth from abandoned flows.
    if (this.pending.size > 32) this.disposeAll();
    this.pending.set(state, { handshake, loopback });
  }

  take(state: string): PendingHandshake | null {
    const entry = this.pending.get(state);
    if (!entry) return null;
    this.pending.delete(state);
    entry.loopback?.close();
    return entry.handshake;
  }

  disposeAll(): void {
    for (const { loopback } of this.pending.values()) loopback?.close();
    this.pending.clear();
  }
}

/**
 * Start a single-shot loopback HTTP server to catch a `redirectUri` of the
 * form `http://localhost:PORT/callback`. On success resolves `{ state, code }`;
 * rejects on bind failure. The caller must keep the returned Server alive via
 * `HandshakeRegistry.register(state, handshake, server)`.
 */
export function startLoopbackServer(
  redirectUri: URL,
): Promise<{ server: Server; state: string; code: string }> {
  // We don't know `state`/`code` ahead of time — they arrive in the request.
  // Caller registers the PendingHandshake keyed by state as soon as it sees it.
  return new Promise((resolve, reject) => {
    const port = parseInt(redirectUri.port, 10) || 0;
    const path = redirectUri.pathname || "/callback";
    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "/", redirectUri.origin);
        if (reqUrl.pathname !== path) {
          res.writeHead(404).end("not found");
          return;
        }
        const state = reqUrl.searchParams.get("state");
        const code = reqUrl.searchParams.get("code");
        if (!state || !code) {
          res.writeHead(400).end("missing state/code");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
          "<!doctype html><meta charset=utf-8><title>Authorized</title>" +
            "<body style='font-family:-apple-system,sans-serif;padding:2em'>" +
            "<h2>Authorization complete</h2>You can close this tab and return to peach-pi.</body>",
        );
        resolve({ server, state, code });
      } catch (err) {
        res.writeHead(500).end("internal");
        reject(err);
      }
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      /* listening */
    });
  });
}
