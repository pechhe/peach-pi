import { test } from "node:test";
import assert from "node:assert/strict";
import type { OAuthPreset } from "@peach-pi/shared-types";
import {
  brokerBase,
  brokerConfigured,
  buildBrokerStartUrl,
  brokerPickup,
  brokerRefresh,
} from "../../electron/services/oauth-broker.ts";
import { usesBroker } from "../../electron/services/connector-clients.ts";

const ENV = "PEACH_OAUTH_BROKER";

function withBroker<T>(base: string | undefined, fn: () => T): T {
  const prev = process.env[ENV];
  if (base === undefined) delete process.env[ENV];
  else process.env[ENV] = base;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[ENV];
    else process.env[ENV] = prev;
  }
}

function preset(over: Partial<OAuthPreset>): OAuthPreset {
  return {
    provider: "test",
    label: "Test",
    authorizeUrl: "https://p.test/auth",
    tokenUrl: "https://p.test/token",
    scopes: [],
    usePkce: true,
    useBasicAuth: false,
    redirectUri: "http://localhost:8471/callback",
    ...over,
  };
}

test("brokerConfigured reflects env, base trims trailing slash", () => {
  withBroker(undefined, () => {
    assert.equal(brokerConfigured(), false);
    assert.equal(brokerBase(), "");
  });
  withBroker("https://broker.test/", () => {
    assert.equal(brokerConfigured(), true);
    assert.equal(brokerBase(), "https://broker.test");
  });
});

test("buildBrokerStartUrl encodes provider, redirect, state", () => {
  const url = buildBrokerStartUrl({
    base: "https://broker.test",
    provider: "notion",
    appRedirect: "peachpi://oauth/callback",
    state: "st-123",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://broker.test/start");
  assert.equal(u.searchParams.get("provider"), "notion");
  assert.equal(u.searchParams.get("app_redirect"), "peachpi://oauth/callback");
  assert.equal(u.searchParams.get("state"), "st-123");
});

test("usesBroker: confidential needs broker; PKCE never uses broker", () => {
  const confidential = preset({ provider: "notion", usePkce: false, useBasicAuth: true });
  const pkce = preset({ provider: "linear", usePkce: true });
  withBroker(undefined, () => {
    assert.equal(usesBroker(confidential), false); // no broker configured
    assert.equal(usesBroker(pkce), false);
  });
  withBroker("https://broker.test", () => {
    assert.equal(usesBroker(confidential), true);
    assert.equal(usesBroker(pkce), false); // PKCE handled directly, never broker
  });
});

test("brokerPickup GETs /pickup?token and parses JSON", async () => {
  const calls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ access_token: "at", token_type: "bearer" }), { status: 200 });
  }) as typeof fetch;
  try {
    const tok = await brokerPickup("https://broker.test", "pk-1");
    assert.equal(tok.access_token, "at");
    assert.equal(calls[0], "https://broker.test/pickup?token=pk-1");
  } finally {
    globalThis.fetch = orig;
  }
});

test("brokerRefresh POSTs /refresh with provider + refresh_token", async () => {
  let seen: { url: string; body: string; method?: string } | null = null;
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    seen = { url: String(input), body: String(init?.body), method: init?.method };
    return new Response(JSON.stringify({ access_token: "new", token_type: "bearer" }), { status: 200 });
  }) as typeof fetch;
  try {
    const tok = await brokerRefresh("https://broker.test", "notion", "rt-9");
    assert.equal(tok.access_token, "new");
    assert.equal(seen!.url, "https://broker.test/refresh");
    assert.equal(seen!.method, "POST");
    assert.deepEqual(JSON.parse(seen!.body), { provider: "notion", refresh_token: "rt-9" });
  } finally {
    globalThis.fetch = orig;
  }
});

test("broker errors surface status + body", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(() => brokerPickup("https://broker.test", "missing"), /404/);
  } finally {
    globalThis.fetch = orig;
  }
});
