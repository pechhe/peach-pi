import { randomUUID } from "node:crypto";
import type {
  Connector,
  ConnectorOauthConfig,
  CreateApiKeyInput,
  CreateOAuthInput,
  OAuthStartResult,
  ResolvedCredential,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import {
  type ConnectorOauthConfigRow,
  type ConnectorRow,
  type ConnectorSecretBlob,
  ConnectorRepo,
} from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";
import type { SecretStore } from "./secret-store.ts";
// The catalog (static seed) + deep-link constants live in their own file so
// adding a provider is a one-file edit. Re-exported here for existing importers.
export {
  DEEP_LINK_SCHEME,
  DEEP_LINK_REDIRECT,
  LOOPBACK_REDIRECT,
  OAUTH_PRESETS,
} from "./connector-catalog.ts";
import { DEEP_LINK_SCHEME, OAUTH_PRESETS } from "./connector-catalog.ts";
import { loadProvisionedClient, usesBroker } from "./connector-clients.ts";
import { brokerBase, buildBrokerStartUrl, brokerPickup, brokerRefresh } from "./oauth-broker.ts";
import {
  type PkcePair,
  type PendingHandshake,
  type TokenResponse,
  HandshakeRegistry,
  buildAuthorizeUrl,
  callbackTransport,
  exchangeCode,
  expiryFromTtl,
  generatePkce,
  parseCallbackUrl,
  randomState,
  refreshAccessToken,
  startLoopbackServer,
} from "./oauth-flow.ts";

const REFRESH_BUFFER_MS = 60_000; // refresh 60s before actual expiry.

/** Owns connector CRUD + credential resolution + the OAuth callback fan-out. */
export class ConnectorService {
  private repo: ConnectorRepo;
  private secrets: SecretStore;
  private emit: Emit;
  private handshakes = new HandshakeRegistry();

  constructor(db: AppDb, emit: Emit, secrets: SecretStore) {
    this.repo = new ConnectorRepo(db);
    this.emit = emit;
    this.secrets = secrets;
  }

  list(): Connector[] {
    return this.repo.all().map((r) => this.toConnector(r));
  }

  /**
   * One-click Connect from the catalog: provision the OAuth client (bundled or
   * from the local clients file), (re)create the connector silently, and start
   * the browser OAuth flow. No form — the user only approves in the browser.
   * Throws if no client is provisioned for the provider.
   */
  async connectCatalog(provider: string): Promise<OAuthStartResult> {
    const preset = OAUTH_PRESETS.find((p) => p.provider === provider);
    if (!preset) throw new Error(`Unknown provider: ${provider}`);

    // Confidential providers route through the broker (it holds the secret) —
    // no local client needed. Otherwise a client must be provisioned locally.
    const broker = usesBroker(preset);
    const client = broker ? null : loadProvisionedClient(preset);
    if (!broker && !client) {
      throw new Error(
        `No OAuth client configured for "${provider}". Register an app with the ` +
          `provider and add its credentials to ~/.pi/agent/peach-connectors-clients.json, ` +
          `or use the manual form.`,
      );
    }
    // Drop any prior connector for this provider so repeated Connects don't pile
    // up duplicates; we recreate fresh with the current client + endpoints.
    for (const row of this.repo.all()) {
      if (row.provider === provider && row.auth_kind === "oauth") await this.revoke(row.id);
    }
    const created = await this.createOAuth({
      provider,
      label: preset.label,
      clientId: client?.clientId ?? "",
      clientSecret: client?.clientSecret ?? "",
      redirectUri: preset.redirectUri,
      authorizeUrl: preset.authorizeUrl,
      tokenUrl: preset.tokenUrl,
      scopes: preset.scopes,
      usePkce: preset.usePkce,
      useBasicAuth: preset.useBasicAuth,
      useBroker: broker,
    });
    return this.startOAuth(created.id);
  }

  async createApiKey(input: CreateApiKeyInput): Promise<Connector> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const blob: ConnectorSecretBlob = { apiKey: input.apiKey };
    const secretBytes = await this.secrets.encrypt(JSON.stringify(blob));
    this.repo.insert({
      id,
      provider: input.provider,
      label: input.label,
      authKind: "api_key",
      configJson: "{}",
      secretBlob: new Uint8Array(secretBytes),
      expiresAt: null,
      now,
    });
    this.emit("event:connectorsChanged", undefined);
    return this.toConnector(this.repo.get(id)!);
  }

  async createOAuth(input: CreateOAuthInput): Promise<Connector> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const config: ConnectorOauthConfigRow = {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      authorizeUrl: input.authorizeUrl,
      tokenUrl: input.tokenUrl,
      scopes: input.scopes ?? [],
      usePkce: input.usePkce ?? true,
      useBasicAuth: input.useBasicAuth ?? false,
      useBroker: input.useBroker ?? false,
    };
    // Store the client secret in the encrypted blob up-front so the OAuth
    // exchange can complete without ever asking the renderer again. No access
    // token yet → `connected = false` until the callback lands. PKCE public
    // clients have no secret to store.
    const blob: ConnectorSecretBlob = input.clientSecret
      ? { clientSecret: input.clientSecret }
      : {};
    const secretBytes = await this.secrets.encrypt(JSON.stringify(blob));
    this.repo.insert({
      id,
      provider: input.provider,
      label: input.label,
      authKind: "oauth",
      configJson: JSON.stringify(config),
      secretBlob: new Uint8Array(secretBytes),
      expiresAt: null,
      now,
    });
    this.emit("event:connectorsChanged", undefined);
    return this.toConnector(this.repo.get(id)!);
  }

  /** Begin an OAuth handshake: generate state + PKCE (if supported), register
   *  the pending flow, and (for loopback redirects) start the catch server.
   *  The renderer opens the returned `authUrl` in the default browser. */
  async startOAuth(connectorId: string): Promise<OAuthStartResult> {
    const row = this.repo.get(connectorId);
    if (!row) throw new Error(`No connector ${connectorId}`);
    if (row.auth_kind !== "oauth") throw new Error("Not an OAuth connector");
    const config = JSON.parse(row.config_json) as ConnectorOauthConfigRow;
    const state = randomState();

    let handshake: PendingHandshake;
    let authUrl: string;
    if (config.useBroker) {
      // Broker-mediated: the vendor service holds the secret and talks to the
      // provider. We only open its /start URL and await the bounce-back, which
      // arrives at config.redirectUri with a single-use pickup token as `code`.
      const base = brokerBase();
      if (!base) throw new Error("No OAuth broker configured");
      handshake = {
        connectorId: row.id,
        clientId: "",
        clientSecret: "",
        redirectUri: config.redirectUri,
        tokenUrl: config.tokenUrl,
        useBasicAuth: config.useBasicAuth,
        pkce: null,
        broker: { base, provider: row.provider },
      };
      authUrl = buildBrokerStartUrl({ base, provider: row.provider, appRedirect: config.redirectUri, state });
    } else {
      const pkce: PkcePair | null = config.usePkce ? generatePkce() : null;
      // Pull the client secret out of the encrypted blob to keep it out of
      // main-memory plain config.
      const blob = await this.readSecretBlob(row);
      // Confidential clients (no PKCE) must present a secret; PKCE public clients
      // can authenticate with the verifier alone.
      if (!config.usePkce && !blob?.clientSecret) {
        throw new Error("Connector missing client secret");
      }
      handshake = {
        connectorId: row.id,
        clientId: config.clientId,
        clientSecret: blob?.clientSecret ?? "",
        redirectUri: config.redirectUri,
        tokenUrl: config.tokenUrl,
        useBasicAuth: config.useBasicAuth,
        pkce,
      };
      authUrl = buildAuthorizeUrl({
        authorizeUrl: config.authorizeUrl,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scopes: config.scopes,
        state,
        pkce,
      });
    }

    if (callbackTransport(config.redirectUri) === "loopback") {
      const uri = new URL(config.redirectUri);
      const { server, state: st, code } = await startLoopbackServer(uri);
      // signalResolve fires inside the loopback handler; we register the
      // pending handshake up front so startLoopbackServer's resolve (which
      // happens after the request arrives) can pair with it.
      this.handshakes.register(state, handshake, server);
      // Re-route the loopback-emitted state+code through the same handler.
      void this.handleCallback(st, code).catch((e) => this.failHandshake(row.id, e));
    } else {
      this.handshakes.register(state, handshake);
    }
    return { authUrl };
  }

  /** Called by main.ts when a `peachpi://oauth/callback` deep link arrives. */
  async handleDeepLink(url: string): Promise<void> {
    const parsed = parseCallbackUrl(url, DEEP_LINK_SCHEME);
    if (!parsed) return;
    await this.handleCallback(parsed.state, parsed.code);
  }

  private async handleCallback(state: string, code: string): Promise<void> {
    const handshake = this.handshakes.take(state);
    if (!handshake) return; // unknown/expired state — ignore.
    const row = this.repo.get(handshake.connectorId);
    if (!row) return;
    try {
      // Broker handshakes carry a single-use pickup token in `code`; redeem it
      // for the token set. Direct handshakes exchange the provider auth code.
      const token = handshake.broker
        ? await brokerPickup(handshake.broker.base, code)
        : await exchangeCode({
            tokenUrl: handshake.tokenUrl,
            clientId: handshake.clientId,
            clientSecret: handshake.clientSecret,
            redirectUri: handshake.redirectUri,
            useBasicAuth: handshake.useBasicAuth,
            code,
            pkce: handshake.pkce,
          });
      await this.persistOAuthTokens(row, token);
      this.emit("event:connectorsChanged", undefined);
    } catch (err) {
      this.failHandshake(handshake.connectorId, err);
    }
  }

  /** Re-run token refresh (or signal that re-auth is needed). */
  async refresh(connectorId: string): Promise<Connector> {
    const row = this.repo.get(connectorId);
    if (!row) throw new Error(`No connector ${connectorId}`);
    const blob = await this.readSecretBlob(row);
    if (!blob?.refreshToken) {
      throw new Error("No refresh token; user must re-authenticate");
    }
    const config = JSON.parse(row.config_json) as ConnectorOauthConfigRow;
    // Confidential refreshes need the secret, which only the broker holds.
    const token = config.useBroker
      ? await brokerRefresh(brokerBase(), row.provider, blob.refreshToken)
      : await refreshAccessToken({
          tokenUrl: config.tokenUrl,
          clientId: config.clientId,
          clientSecret: blob.clientSecret,
          redirectUri: config.redirectUri,
          useBasicAuth: config.useBasicAuth,
          refreshToken: blob.refreshToken,
        });
    await this.persistOAuthTokens(row, token, blob);
    this.emit("event:connectorsChanged", undefined);
    return this.toConnector(this.repo.get(connectorId)!);
  }

  /** Local-only revocation: delete the row. Provider-side revocation (when a
   *  revoke endpoint exists) is a follow-up. */
  async revoke(connectorId: string): Promise<void> {
    this.repo.delete(connectorId);
    this.emit("event:connectorsChanged", undefined);
  }

  /** Resolve a saved connector to ready-to-use credentials. Lazy-refreshes an
   *  expired token. This is the agent's "give me the key" call (apiKeyHelper
   *  analogue) — only main-process callers (the agent/tool runner) see this. */
  async resolve(provider: string): Promise<ResolvedCredential | null> {
    const row = this.repo.all().find((r) => r.provider === provider);
    if (!row) return null;
    const blob = await this.readSecretBlob(row);
    if (!blob) return null;

    if (row.auth_kind === "api_key" && blob.apiKey) {
      return {
        headers: { Authorization: `Bearer ${blob.apiKey}` },
        tokenType: "api_key",
        expiresAt: null,
      };
    }
    if (!blob.accessToken) return null;

    // Refresh first if expired (or about to).
    if (blob.expiresAt && Date.parse(blob.expiresAt) - REFRESH_BUFFER_MS <= Date.now()) {
      if (blob.refreshToken) {
        try {
          await this.refresh(row.id);
          return this.resolve(provider);
        } catch {
          // fall through with the stale token; reject downstream.
        }
      }
    }
    const tokenType = blob.tokenType ?? "Bearer";
    return {
      headers: { Authorization: `${tokenType[0]?.toUpperCase()}${tokenType.slice(1)} ${blob.accessToken}` },
      tokenType,
      expiresAt: blob.expiresAt ?? null,
    };
  }

  private async persistOAuthTokens(
    row: ConnectorRow,
    token: TokenResponse,
    existing?: ConnectorSecretBlob,
  ): Promise<void> {
    const blob: ConnectorSecretBlob = {
      ...(existing ?? {}),
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? existing?.refreshToken,
      tokenType: token.token_type,
      scope: token.scope ?? existing?.scope,
      expiresAt: expiryFromTtl(token.expires_in) ?? undefined,
    };
    const secretBytes = await this.secrets.encrypt(JSON.stringify(blob));
    this.repo.updateSecret(row.id, new Uint8Array(secretBytes), blob.expiresAt ?? null, new Date().toISOString());
  }

  private async readSecretBlob(row: ConnectorRow): Promise<ConnectorSecretBlob | null> {
    if (!row.secret_blob) return null;
    const plain = await this.secrets.decrypt(new Uint8Array(row.secret_blob));
    try {
      return JSON.parse(plain) as ConnectorSecretBlob;
    } catch {
      return null;
    }
  }

  private failHandshake(_connectorId: string, err: unknown): void {
    // Surface to DevTap/main logs; UI sees `connected: false` on next list.
    console.error("[connector-service] OAuth handshake failed:", err);
  }

  private toConnector(r: ConnectorRow): Connector {
    const base = {
      id: r.id,
      provider: r.provider,
      label: r.label,
      authKind: r.auth_kind,
      connected: r.auth_kind === "api_key" || !!r.secret_blob,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
    if (r.auth_kind !== "oauth") return base;
    const cfg = JSON.parse(r.config_json) as ConnectorOauthConfigRow;
    const oauth: ConnectorOauthConfig = {
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      authorizeUrl: cfg.authorizeUrl,
      tokenUrl: cfg.tokenUrl,
      scopes: cfg.scopes,
      usePkce: cfg.usePkce,
      useBasicAuth: cfg.useBasicAuth,
    };
    return { ...base, oauth };
  }
}
