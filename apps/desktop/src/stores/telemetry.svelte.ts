import { api } from "../lib/ipc";
import { initTelemetry } from "../lib/telemetry";
import type { TelemetryConsent } from "@peach-pi/shared-types";

/**
 * Renderer store for telemetry consent + update status.
 *
 * Consent is the single source of truth driving PostHog/Sentry init
 * (`lib/telemetry.ts`). Loaded once on boot; updates go through the main
 * process IPC and propagate back via the `event:telemetryConsentChanged`
 * event. Update status mirrors `AutoUpdateService` via `event:updateStatus`.
 */
let consent = $state<TelemetryConsent>(null);
let loaded = false;

export const telemetry = {
  get consent(): TelemetryConsent {
    return consent;
  },
  /** True when telemetry is opted in AND a build key is present. */
  get enabled(): boolean {
    return consent === true;
  },
  async load(force = false): Promise<void> {
    if (!force && loaded) return;
    loaded = true;
    consent = await api.invoke("app:getTelemetryConsent");
    if (consent === true) initTelemetry(true);
  },
  async set(next: TelemetryConsent): Promise<void> {
    consent = next;
    initTelemetry(next);
    await api.invoke("app:setTelemetryConsent", next);
  },
  /** Called when the main process broadcasts a consent change. */
  applyRemote(next: TelemetryConsent): void {
    consent = next;
    initTelemetry(next);
  },
};

// Subscribe to main-process consent changes (e.g. set from another surface).
let subscribed = false;
export function subscribeTelemetry(): () => void {
  if (subscribed) return () => {};
  subscribed = true;
  const off1 = api.on("event:telemetryConsentChanged", () => {
    void telemetry.load(true);
  });
  return off1;
}
