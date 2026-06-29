import type { AuthProviderStatus } from "@peach-pi/shared-types";

import { api } from "../lib/ipc";

/**
 * Provider auth state for the Settings → Account section. Mirrors pi's
 * auth.json (the source of truth) via the `auth:*` IPC channels; the
 * main process owns all credential reads/writes. Reloads itself whenever
 * main signals `event:authProvidersChanged` (login/logout from anywhere).
 */
class ProvidersStore {
  list = $state<AuthProviderStatus[]>([]);
  loading = $state(false);
  private subscribed = false;

  async load(): Promise<void> {
    if (!this.subscribed) {
      this.subscribed = true;
      api.on("event:authProvidersChanged", () => void this.reload());
    }
    this.loading = true;
    try {
      this.list = await api.invoke("auth:listProviders");
    } finally {
      this.loading = false;
    }
  }

  /** Silent refresh (no loading flicker) — used by the change event. */
  private async reload(): Promise<void> {
    this.list = await api.invoke("auth:listProviders");
  }

  async loginApiKey(providerId: string, key: string): Promise<void> {
    this.list = await api.invoke("auth:loginApiKey", providerId, key);
  }

  async logout(providerId: string): Promise<void> {
    this.list = await api.invoke("auth:logout", providerId);
  }
}

export const providers = new ProvidersStore();
