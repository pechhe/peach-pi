import { test } from "node:test";
import assert from "node:assert/strict";
import type { OAuthPreset } from "@peach-pi/shared-types";
import { loadProvisionedClient, hasProvisionedClient } from "../../electron/services/connector-clients.ts";

// Synthetic presets use fake provider ids so the user's real
// ~/.pi/agent/peach-connectors-clients.json can never shadow these assertions.
function preset(over: Partial<OAuthPreset>): OAuthPreset {
  return {
    provider: "test-" + Math.random().toString(36).slice(2),
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

// PKCE tier: a bundled client_id alone is enough for one-click (verifier auths).
test("PKCE preset with client_id only is one-click ready", () => {
  const p = preset({ usePkce: true, clientId: "pkce-cid" });
  assert.equal(hasProvisionedClient(p), true);
  assert.deepEqual(loadProvisionedClient(p), { clientId: "pkce-cid", clientSecret: undefined });
});

// Confidential tier: client_id without a secret is NOT usable → falls to form.
test("confidential preset with client_id but no secret is NOT one-click ready", () => {
  const p = preset({ usePkce: false, useBasicAuth: true, clientId: "conf-cid" });
  assert.equal(hasProvisionedClient(p), false);
  assert.equal(loadProvisionedClient(p), null);
});

// Confidential tier with both id + secret → usable.
test("confidential preset with client_id and secret is one-click ready", () => {
  const p = preset({ usePkce: false, useBasicAuth: true, clientId: "conf-cid", clientSecret: "conf-secret" });
  assert.equal(hasProvisionedClient(p), true);
  assert.deepEqual(loadProvisionedClient(p), { clientId: "conf-cid", clientSecret: "conf-secret" });
});

// Explicit clientSecretRequired overrides the PKCE-derived default.
test("clientSecretRequired=true forces secret even when usePkce=true", () => {
  const p = preset({ usePkce: true, clientSecretRequired: true, clientId: "cid" });
  assert.equal(hasProvisionedClient(p), false);
});

// No client at all → not ready.
test("preset with no client_id is not one-click ready", () => {
  assert.equal(hasProvisionedClient(preset({ usePkce: true })), false);
});
