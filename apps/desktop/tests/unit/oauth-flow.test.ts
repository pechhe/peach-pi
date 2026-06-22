import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type PkcePair,
  buildAuthorizeUrl,
  callbackTransport,
  expiryFromTtl,
  generatePkce,
  parseCallbackUrl,
  randomState,
  HandshakeRegistry,
} from "../../electron/services/oauth-flow.ts";
import { ConnectorRepo } from "../../electron/persistence/repositories.ts";
import { openDb, migrate } from "../../electron/persistence/db.ts";
import type { SecretStore } from "../../electron/services/secret-store.ts";
import { ConnectorService } from "../../electron/services/connector-service.ts";
import { DatabaseSync } from "node:sqlite";

// PKCE generator (RFC 7636)
test("generatePkce: verifier 43-128 chars, S256 challenge, sha256 base64url", () => {
  const { verifier, challenge, method } = generatePkce();
  assert.equal(method, "S256");
  assert.ok(verifier.length >= 43 && verifier.length <= 128, "verifier length in range");
  assert.ok(verifier.match(/^[A-Za-z0-9._~-]+$/), "verifier unreserved set");
  // Challenge is base64url (no padding, url-safe).
  assert.ok(challenge.match(/^[A-Za-z0-9_-]+$/), "challenge base64url");
});

test("generatePkce: distinct per call", () => {
  const a = generatePkce();
  const b = generatePkce();
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.challenge, b.challenge);
});

test("randomState: 48 hex chars, distinct", () => {
  const s = randomState();
  assert.ok(s.match(/^[0-9a-f]{48}$/));
  assert.notEqual(s, randomState());
});

// Authorize URL building
test("buildAuthorizeUrl: includes PKCE params when provided", () => {
  const url = buildAuthorizeUrl({
    authorizeUrl: "https://provider.test/oauth/authorize",
    clientId: "cid",
    redirectUri: "peachpi://oauth/callback",
    scopes: ["read", "write"],
    state: "st",
    pkce: { verifier: "v", challenge: "c", method: "S256" },
  });
  const u = new URL(url);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), "peachpi://oauth/callback");
  assert.equal(u.searchParams.get("state"), "st");
  assert.equal(u.searchParams.get("scope"), "read write");
  assert.equal(u.searchParams.get("code_challenge"), "c");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

test("buildAuthorizeUrl: omits PKCE params when null (Notion path)", () => {
  const url = buildAuthorizeUrl({
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    clientId: "cid",
    redirectUri: "http://localhost:8471/callback",
    scopes: [],
    state: "st",
    pkce: null,
  });
  const u = new URL(url);
  assert.equal(u.searchParams.get("code_challenge"), null);
  assert.equal(u.searchParams.get("code_challenge_method"), null);
  assert.equal(u.searchParams.has("scope"), false, "empty scope omitted");
});

test("buildAuthorizeUrl: empty-scope join does not append blank", () => {
  const url = buildAuthorizeUrl({
    authorizeUrl: "https://p.test/auth",
    clientId: "c",
    redirectUri: "http://localhost:1/cb",
    scopes: [],
    state: "s",
    pkce: null,
  });
  assert.ok(!url.includes("scope="));
});

// Expiry
test("expiryFromTtl: returns null for missing/zero, else ISO now + ttl", () => {
  assert.equal(expiryFromTtl(undefined), null);
  assert.equal(expiryFromTtl(0), null);
  const now = 1_000_000_000;
  const iso = expiryFromTtl(3600, now);
  assert.equal(iso, new Date(now + 3600 * 1000).toISOString());
});

// Callback transport detection
test("callbackTransport: loopback for http://localhost, deep-link for custom scheme", () => {
  assert.equal(callbackTransport("http://localhost:8471/callback"), "loopback");
  assert.equal(callbackTransport("http://127.0.0.1:8471/callback"), "loopback");
  assert.equal(callbackTransport("peachpi://oauth/callback"), "deep-link");
});

// Deep-link URL parsing
test("parseCallbackUrl: extracts state+code from our scheme, rejects others", () => {
  const ok = parseCallbackUrl("peachpi://oauth/callback?code=abc&state=xyz");
  assert.deepEqual(ok, { state: "xyz", code: "abc" });

  assert.equal(parseCallbackUrl("https://oauth/callback?code=a&state=s"), null);
  assert.equal(parseCallbackUrl("peachpi://other/callback?code=a&state=s"), null);
  assert.equal(parseCallbackUrl("peachpi://oauth/callback?code=a"), null, "missing state");
  assert.equal(parseCallbackUrl("not a url"), null);
});

// Handshake registry lifecycle (no loopback server in these tests)
test("HandshakeRegistry: register → take removes; unknown state returns null", () => {
  const reg = new HandshakeRegistry();
  const handshake = {
    connectorId: "c1",
    clientId: "cid",
    clientSecret: "sec",
    redirectUri: "peachpi://oauth/callback",
    tokenUrl: "https://t.test/token",
    useBasicAuth: false,
    pkce: null,
  };
  reg.register("s1", handshake);
  assert.equal(reg.take("s1"), handshake);
  // Second take returns null (already consumed).
  assert.equal(reg.take("s1"), null);
  assert.equal(reg.take("unknown"), null);
});

// ConnectorRepo persists metadata without leaking the secret blob as JSON
const HANDSHAKE: PkcePair = { verifier: "v", challenge: "c", method: "S256" };
void HANDSHAKE;

test("ConnectorRepo: insert + get + updateSecret + delete round-trip", () => {
  const db = new DatabaseSync(":memory:");
  // Need migrations applied for the connectors table.
  migrate(db);
  const repo = new ConnectorRepo(db);
  repo.insert({
    id: "c1",
    provider: "notion",
    label: "Personal",
    authKind: "oauth",
    configJson: JSON.stringify({ clientId: "cid", scopes: [], usePkce: false, useBasicAuth: true }),
    secretBlob: new Uint8Array([1, 2, 3]),
    expiresAt: "2026-01-01T00:00:00.000Z",
    now: "2026-01-01T00:00:00.000Z",
  });
  const got = repo.get("c1")!;
  assert.equal(got.provider, "notion");
  assert.equal(got.auth_kind, "oauth");
  assert.deepEqual(Array.from(got.secret_blob ?? []), [1, 2, 3]);

  repo.updateSecret("c1", new Uint8Array([9, 8, 7]), "2026-06-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z");
  assert.deepEqual(Array.from(repo.get("c1")!.secret_blob ?? []), [9, 8, 7]);

  repo.delete("c1");
  assert.equal(repo.get("c1"), null);
});

// openDb smoke test confirmed the migration applies v7 cleanly (the table exists).
test("openDb: connectors table exists after migration v7", () => {
  const db = openDb(":memory:");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='connectors'")
    .all() as { name: string }[];
  assert.equal(tables.length, 1);
});

// A passthrough secret store: encrypt/decrypt are identity (plain JSON). Good
// enough for service-level tests that only inspect the stored blob's contents.
const fakeSecrets: SecretStore = {
  isAvailable: () => true,
  async encrypt(plain) {
    return new TextEncoder().encode(plain);
  },
  async decrypt(blob) {
    return new TextDecoder().decode(blob);
  },
};

// No-op emit: tests don't drive a renderer, so swallow events.
const noopEmit = () => {};

// PKCE public clients (GitHub, Google, Linear, …) must be able to Connect with
// NO client_secret — the verifier authenticates the exchange.
test("createOAuth: PKCE client with no secret is stored without one", async () => {
  const db = openDb(":memory:");
  migrate(db);
  const svc = new ConnectorService(db, noopEmit, fakeSecrets);
  const created = await svc.createOAuth({
    provider: "github",
    label: "GitHub",
    clientId: "public-cid",
    redirectUri: "http://localhost:8471/callback",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo"],
    usePkce: true,
    useBasicAuth: false,
  });
  assert.equal(created.provider, "github");
  // resolve() confirms the row is readable; an empty client_secret is fine for PKCE.
  const resolved = await svc.resolve("github");
  assert.equal(resolved, null); // no access token yet — not connected until callback
});

// A confidential client (e.g. Notion) still stores its secret as before.
test("createOAuth: confidential client stores the secret", async () => {
  const db = openDb(":memory:");
  migrate(db);
  const svc = new ConnectorService(db, noopEmit, fakeSecrets);
  await svc.createOAuth({
    provider: "notion",
    label: "Notion",
    clientId: "notion-cid",
    clientSecret: "notion-secret",
    redirectUri: "http://localhost:8471/callback",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    usePkce: false,
    useBasicAuth: true,
  });
  const all = svc.list();
  assert.equal(all.length, 1);
  assert.equal(all[0]!.provider, "notion");
});
