# Peach Pi — Privacy Policy

**Last updated: 2026-06-26**

Peach Pi is a local-first macOS application. This policy explains what data
Peach Pi collects, how it is used, and the choices you have.

## What we collect

Peach Pi only collects telemetry data **if you opt in** via the telemetry
consent prompt shown on first launch (or in Settings). With telemetry enabled,
we collect:

- **App lifecycle events**: `app_launched` (cold start), `app_active`
  (foreground heartbeat). Each carries `app_version`, `os` (`darwin`), and
  `arch`.
- **Anonymous usage events**: high-level feature interactions (named only,
  no content).
- **Crash reports**: native minidumps + uncaught exceptions, including stack
  traces and the app version, when crash reporting is enabled.

We do **not** collect:

- Conversation content, prompts, or AI outputs (these stay on your device).
- Source code, file contents, or repository contents.
- API keys, credentials, or secrets.
- Personal identity information (no names, emails, or user IDs are sent).
- Your IP address is not used for Tracking and is not associated with your
  events beyond transient network routing.

## Where data goes

- **Product analytics** (launch, active, feature usage): PostHog, our
  analytics provider, or a self-hosted instance. Events are queued locally and
  flushed when the network is available.
- **Crash reports**: Sentry. Minidumps are uploaded on the next launch after a
  crash.

## Data retention

Analytics events are retained for up to 18 months. Crash reports are retained
for 90 days.

## Your choices

- Telemetry and crash reporting are **off by default**. You can change your
  choice at any time in Settings → Telemetry, or by deleting the consent flag
  in `~/.pi/agent/settings.json` (`telemetryConsent`).
- Disabling telemetry stops all collection immediately; the app continues to
  work fully offline and locally.

## Auto-updates

If you have a production build, Peach Pi checks a static update manifest to
look for new versions. The check sends your current app version, OS, and CPU
architecture along with the request (standard HTTP). No personal data is sent.

Children
--------

Peach Pi is not directed at children under 13 and is not intended for their use.

Changes
-------

We may update this policy. Material changes ship with an app update and are
noted in the release notes.

Contact
-------

Open an issue at the project repository for privacy inquiries.
