import { api } from "../lib/ipc";
import type { RemoteHostConfig } from "@peach-pi/shared-types";

/**
 * Master-side relay serving status, surfaced app-wide so the always-mounted
 * sidebar can pulse the Remote lamp green while the relay "is active" (serving
 * sessions over the tailnet). RemoteView owns the toggles; this store is a
 * read-only mirror kept live via `event:remoteHostStatus` (fired on every
 * serving-state change, including boot auto-resume) — the sidebar lives outside
 * the Remote view, so it can't rely on RemoteView's local state.
 */
let status = $state<RemoteHostConfig | null>(null);

export const remoteHost = {
  /** True while the relay is serving (the Remote "is active"). */
  get active(): boolean {
    return status?.enabled ?? false;
  },
  /** Load current status + listen for serving-state changes. Idempotent. */
  init(): void {
    void this.load();
    api.on("event:remoteHostStatus", () => void this.load());
  },
  async load(): Promise<void> {
    status = await api.invoke("remote:hostStatus");
  },
};

// Survive vite HMR: a hot reload swaps in a fresh singleton, so the
// already-mounted sidebar would keep the stale instance. Re-init the fresh one
// so the lamp stays coupled to serving state after a mid-session edit.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    remoteHost.init();
  });
}
