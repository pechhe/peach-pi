# ADR-0013 — Release: auto-update, crash reporting, product analytics

**Status**: Accepted
**Date**: 2026-06-26

## Context

Pre-release readiness for the public macOS distribution of Peach Pi. Before
this ADR the app had no way to (a) push app-binary updates to users, (b)
collect crash reports, or (c) understand adoption (MAU/DAU, version
distribution, feature usage).

`PiUpdateService` (ADR-existing) and `peach-vision-consent` are **distinct**:
the former runs `pi update --extensions` to refresh the bundled pi agent's
*extensions*, not the Peach Pi app binary; the latter gates vision-proxy image
egress. Neither touches app updates or product analytics.

## Decision

Add three opt-in, env-gated subsystems, all **off by default** so dev builds
and unconfigured packaged builds are unaffected:

1. **App auto-update** via Squirrel.Mac / `autoUpdater`.
   - New `AutoUpdateService` (main) wraps `update-electron-app` with
     `UpdateSourceType.StaticStorage`.
   - Activates only when `PEACH_PI_UPDATE_URL` is set at build/runtime.
   - Forge config gains an env-gated `publisher-s3` + `maker-zip`'s
     `macUpdateManifestBaseUrl` so `RELEASES.json` + ZIP are published to
     S3-compatible storage (AWS S3 or Cloudflare R2 via `S3_ENDPOINT` +
     `S3_FORCE_PATH_STYLE` + `S3_OMIT_ACL`).
   - Status + `update-downloaded` surfaced to the renderer via IPC.

2. **Crash reporting** via `@sentry/electron`.
   - New `TelemetryService` (main) inits Sentry when `SENTRY_DSN` is set.
   - Captures uncaught errors in main + renderer, native crashes via minidump.
   - Renderer-side Sentry init mirrors main when consent + DSN present.

3. **Product analytics** via `posthog-js` (renderer).
   - Activates only when `VITE_POSTHOG_KEY` is present **and** the user has
     opted in via the telemetry consent prompt.
   - Minimal event set: `app_launched`, `app_active` (heartbeat),
     `feature_used`, `app_error`. No conversation / file / credential content.
   - Offline: events batched in-memory and flushed on reconnect.

### Consent model

- `PiSettings.telemetryConsent: boolean | null` (null = not yet asked).
- First launch with `VITE_POSTHOG_KEY` set surfaces a consent dialog.
- Stored persistently in `~/.pi/agent/settings.json`; revocable in Settings.
- Crash reporting (`SENTRY_DSN`) respects the same consent flag — crash
  collection is not enabled until consent is granted, so no path exists to
  upload dumps from a user who declined.

### IPC additions

- `app:getTelemetryConsent` / `app:setTelemetryConsent`
- `app:getUpdateStatus` (invoke) + `event:updateStatus` (event)
- `event:telemetryConsentChanged`

## Consequences

- Three new runtime deps (`update-electron-app`, `@sentry/electron`,
  `posthog-js`) + one devDep (`@electron-forge/publisher-s3`). All pure JS —
  no native rebuild, no impact on the `vendorPiSdk` / `node-pty` prebuild flow.
- No personal data collected. Privacy policy at `docs/privacy-policy.md`.
- Update channels (beta/stable) are a future concern — current design points
  the manifest at a single stable URL; channels can be added later as URL
  path segments without code changes.
