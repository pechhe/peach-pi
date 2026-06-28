import posthog from "posthog-js";
import * as SentryRenderer from "@sentry/electron/renderer";
import { api } from "./ipc";
import type { TelemetryConsent } from "@peach-pi/shared-types";

/**
 * Renderer-side telemetry: PostHog analytics + Sentry crash reporting.
 *
 * Both activate ONLY when the user has granted telemetry consent (opt-in).
 *
 * - PostHog (`posthog-js`): anonymous product analytics (launch, active,
 *   feature usage). Key baked via Vite `VITE_POSTHOG_KEY`.
 * - Sentry (`@sentry/electron/renderer`): renderer errors + breadcrumbs. The
 *   DSN is owned by the main process (`@sentry/electron/main`), which also
 *   captures native crashes via minidump. The renderer client gets its DSN
 *   from main over IPC, so the DSN is never baked in the renderer bundle.
 *
 * Consent model: the Sentry renderer client is initialized at boot with a
 * `beforeSend` drop filter that rejects all events until `consentGranted`
 * flips true (after the user opts in). This avoids an init race — the SDK is
 * ready immediately, but ships nothing pre-consent. Revocation re-drops.
 *
 * No PII, no conversation/file content. Events queue locally while offline.
 */

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

let posthogInitialized = false;
// Flipped true once consent is granted. Gates the Sentry renderer `beforeSend`
// so the client is initialized eagerly but ships nothing pre-consent.
let consentGranted = false;

/** Initialize the Sentry renderer client with a consent-gated before-send. */
SentryRenderer.init({
  beforeSend: (event) => {
    // Drop everything until the user has opted in to telemetry.
    if (!consentGranted) return null;
    return event;
  },
});

function installId(): string {
  // Anonymous per-install id. No PII; persists in localStorage.
  const KEY = "peach-pi.installId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function initTelemetry(consent: TelemetryConsent): void {
  // Consent gates Sentry renderer shipping (see beforeSend above).
  consentGranted = consent === true;
  if (consent !== true) {
    if (posthogInitialized) {
      try {
        posthog.reset();
      } catch {}
      posthogInitialized = false;
    }
    return;
  }
  if (posthogInitialized) return;
  posthogInitialized = true;

  const distinctId = installId();

  if (POSTHOG_KEY) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST || "https://app.posthog.com",
        autocapture: false, // no DOM autocapture — we send explicit events only
        capture_pageview: false,
        disable_session_recording: true, // privacy: no session replay of app contents
        persistence: "localStorage",
        opt_out_capturing_by_default: true,
      });
      posthog.identify(distinctId);
      posthog.opt_in_capturing();
      posthog.register({
        app_version: APP_VERSION,
        os: "darwin",
        arch: navigator.platform,
      });
      posthog.capture("app_launched", { app_version: APP_VERSION });
    } catch (err) {
      console.warn("[telemetry] posthog init failed:", err);
    }
  }

  // Foreground heartbeat for DAU. One per session is enough for active.
  window.addEventListener("focus", () => {
    try {
      posthog.capture("app_active", { app_version: APP_VERSION });
    } catch {}
  });

  // Global error capture → PostHog error event (Sentry catches via its own
  // window.onerror integration above).
  window.addEventListener("error", (event) => {
    try {
      posthog.capture("app_error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
      });
    } catch {}
  });
}

/** Track a named feature interaction. No-op until telemetry is enabled. */
export function trackFeature(name: string, props?: Record<string, unknown>): void {
  if (!posthogInitialized) return;
  try {
    posthog.capture("feature_used", { feature: name, ...props });
  } catch {}
}

/** Capture a named product event with optional metadata. No-op until telemetry is enabled. */
export function captureEvent(event: string, props?: Record<string, unknown>): void {
  if (!posthogInitialized) return;
  try {
    posthog.capture(event, props ?? {});
  } catch {}
}

/** App version injected via Vite's define. Falls back to "0.0.0". */
declare const APP_VERSION: string;

/** Notify the main process that consent changed (so it can init Sentry main). */
export async function setConsent(consent: TelemetryConsent): Promise<void> {
  initTelemetry(consent);
  await api.invoke("app:setTelemetryConsent", consent);
}
