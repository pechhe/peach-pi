import type { PiSettings } from "@peach-pi/shared-types";
import { createIpcStore } from "./create-ipc-store.svelte";

/**
 * Pi agent settings (retry, message delivery).
 * Persisted in ~/.pi/agent/settings.json by the main process.
 *
 * A pure load/set mirror over `app:getPiSettings` / `app:setPiSettings`. The
 * factory's `$state` holds the whole `PiSettings` payload; these accessors
 * project it onto the flat field shape consumers already use (so the Settings
 * view reads `piSettings.retryEnabled` etc., unchanged).
 */
const store = createIpcStore<"app:getPiSettings", "app:setPiSettings">({
  loadChannel: "app:getPiSettings",
  setChannel: "app:setPiSettings",
  default: {
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60_000 } },
    steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time",
    autoUpdateExtensions: true,
    insomnia: false,
    telemetryConsent: null,
    topbar: { devtap: true, fallow: true },
  },
});

export const piSettings = {
  get retryEnabled(): boolean {
    return store.state.retry.enabled;
  },
  get retryMaxRetries(): number {
    return store.state.retry.maxRetries;
  },
  get retryBaseDelayMs(): number {
    return store.state.retry.baseDelayMs;
  },
  get steeringMode(): PiSettings["steeringMode"] {
    return store.state.steeringMode;
  },
  get followUpMode(): PiSettings["followUpMode"] {
    return store.state.followUpMode;
  },
  get autoUpdateExtensions(): boolean {
    return store.state.autoUpdateExtensions;
  },
  get insomnia(): boolean {
    return store.state.insomnia;
  },
  get topbar(): PiSettings["topbar"] {
    return store.state.topbar;
  },
  load: (force?: boolean) => store.load(force),
  patch: (update: Partial<PiSettings>) => store.set(update),
};
