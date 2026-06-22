import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { OAuthPreset } from "@peach-pi/shared-types";
import { brokerConfigured } from "./oauth-broker.ts";

/**
 * Where an OAuth client (client_id + optional client_secret) comes from for a
 * one-click catalog Connect. Plain OAuth has no zero-config registration, so a
 * client must be provisioned once — either bundled on the catalog entry or, to
 * keep secrets out of the repo, dropped into a local file:
 *
 *   ~/.pi/agent/peach-connectors-clients.json
 *   { "notion": { "clientId": "...", "clientSecret": "..." } }
 *
 * The file wins over bundled values. When neither exists, Connect falls back to
 * the BYO form.
 */
const CLIENTS_FILE = join(homedir(), ".pi", "agent", "peach-connectors-clients.json");

export interface ProvisionedClient {
  clientId: string;
  clientSecret?: string;
}

function readClientsFile(): Record<string, ProvisionedClient> {
  try {
    return JSON.parse(readFileSync(CLIENTS_FILE, "utf8")) as Record<string, ProvisionedClient>;
  } catch {
    return {};
  }
}

/** Does this provider's token exchange require a client_secret? PKCE public
 *  clients (GitHub, Google, Linear, …) authenticate with the verifier alone;
 *  confidential clients (Notion) must send a secret. Explicit
 *  `clientSecretRequired` wins; otherwise derive from PKCE support. */
function secretRequired(preset: OAuthPreset): boolean {
  return preset.clientSecretRequired ?? !preset.usePkce;
}

/** True when this provider's confidential handshake should route through the
 *  vendor broker: it needs a secret AND a broker is configured. The broker
 *  holds the secret, so no local credential is required for one-click. */
export function usesBroker(preset: OAuthPreset): boolean {
  return secretRequired(preset) && brokerConfigured();
}

/** Resolve the OAuth client for a provider, or null if none is *usable*. A
 *  confidential provider with only a client_id (no secret) is not usable for a
 *  one-click Connect — it falls back to the BYO form. */
export function loadProvisionedClient(preset: OAuthPreset): ProvisionedClient | null {
  const fromFile = readClientsFile()[preset.provider];
  const candidate: ProvisionedClient | null = fromFile?.clientId
    ? fromFile
    : preset.clientId
      ? { clientId: preset.clientId, clientSecret: preset.clientSecret }
      : null;
  if (!candidate) return null;
  if (secretRequired(preset) && !candidate.clientSecret) return null;
  return candidate;
}

/** True when a one-click Connect is possible for this preset — either via the
 *  broker (confidential providers, no local creds) or a provisioned client
 *  (PKCE client_id, or a confidential client_id+secret from the local file). */
export function hasProvisionedClient(preset: OAuthPreset): boolean {
  return usesBroker(preset) || loadProvisionedClient(preset) !== null;
}
