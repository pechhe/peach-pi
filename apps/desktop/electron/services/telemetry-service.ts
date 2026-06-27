import { app } from "electron";
import { updateElectronApp, UpdateSourceType } from "update-electron-app";
import type { Emit } from "../ipc/registry.ts";
import type { UpdateStatus } from "@peach-pi/shared-types";

/**
 * App-binary auto-update via Squirrel.Mac.
 *
 * Distinct from `PiUpdateService` (which runs `pi update --extensions` to
 * refresh the bundled pi agent's *extensions*). This service swaps the Peach
 * Pi app binary itself.
 *
 * Uses `update-electron-app` to wire the Squirrel.Mac `autoUpdater` feed
 * against a static storage host (Cloudflare R2, S3, GCS, GitHub Releases via
 * `update.electronjs.org`). The helper appends `/darwin/{arch}/RELEASES.json`
 * to `baseUrl` and polls every 10 min by default.
 *
 * Activates only when `PEACH_PI_UPDATE_URL` is set at build/runtime. The URL
 * is the manifest host root, e.g. `https://peach-pi-updates.<account>.r2.dev`.
 *
 * In dev / unsigned builds the env var is absent, so the service is inert:
 * `status.enabled === false` and no feed is ever configured. Squirrel.Mac
 * refuses unsigned apps, so auto-update is only meaningful in a signed,
 * notarized release build anyway.
 *
 * Status (`ready` / `checking` / `error`) is broadcast to the renderer via
 * `event:updateStatus` so a Settings UI or banner can surface it. The default
 * `update-electron-app` notifyUser dialog is left enabled — it prompts the
 * user to relaunch immediately when an update has downloaded.
 */
// Late import so dev builds without the env var never pay the require cost.
type AutoUpdater = {
  on(event: string, cb: (...args: unknown[]) => void): unknown;
  setFeedURL(opts: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
};

export class AutoUpdateService {
  private emit: Emit;
  private updateUrl: string | null;
  private checking = false;
  private ready = false;
  private error: string | null = null;
  private version: string | null = null;
  private started = false;

  constructor(emit: Emit) {
    this.emit = emit;
    this.updateUrl = process.env.PEACH_PI_UPDATE_URL ?? null;
  }

  get status(): UpdateStatus {
    return {
      enabled: !!this.updateUrl,
      ready: this.ready,
      checking: this.checking,
      error: this.error,
      version: this.version,
    };
  }

  /** Wire up the auto-updater + feed. No-op if disabled. */
  start(): void {
    if (!this.updateUrl || this.started) return;
    this.started = true;
    try {
      updateElectronApp({
        updateSource: {
          type: UpdateSourceType.StaticStorage,
          baseUrl: this.updateUrl,
        },
        // Preserve the default "Restart/Later" prompt after download, but
        // also mirror state into our IPC so the renderer can show a banner.
      });
    } catch (err) {
      this.error = String(err);
      this.publish();
      return;
    }
    // Tap the underlying autoUpdater to mirror state over IPC. We import it
    // lazily — only when the feature is enabled — so it is not pulled into
    // dev builds' startup path.
    void this.tapAutoUpdater();
  }

  private async tapAutoUpdater(): Promise<void> {
    try {
      const { autoUpdater } = await import("electron");
      const au = autoUpdater as unknown as AutoUpdater;
      au.on("checking-for-update", () => {
        this.checking = true;
        this.publish();
      });
      au.on("update-available", () => {
        this.checking = true;
        this.publish();
      });
      au.on("update-not-available", () => {
        this.checking = false;
        this.publish();
      });
      au.on("update-downloaded", (_event, releaseNotes, releaseName) => {
        this.checking = false;
        this.ready = true;
        this.version =
          typeof releaseName === "string"
            ? releaseName
            : typeof releaseNotes === "string"
              ? releaseNotes
              : null;
        this.publish();
      });
      au.on("error", (err: unknown) => {
        this.error = err instanceof Error ? err.message : String(err);
        this.checking = false;
        this.publish();
      });
    } catch (err) {
      // update-electron-app already wired the feed; tapping is best-effort.
      console.warn("[auto-update] event tap failed:", err);
    }
  }

  /** Proactively check for an update. No-op if disabled. */
  async checkNow(): Promise<void> {
    if (!this.updateUrl) return;
    try {
      const { autoUpdater } = await import("electron");
      (autoUpdater as unknown as AutoUpdater).checkForUpdates();
    } catch (err) {
      this.error = String(err);
      this.publish();
    }
  }

  /** Relaunch to apply a downloaded update. No-op if nothing is ready. */
  installUpdate(): void {
    if (!this.ready) return;
    void (async () => {
      const { autoUpdater } = await import("electron");
      (autoUpdater as unknown as AutoUpdater).quitAndInstall();
    })();
  }

  private publish(): void {
    this.emit("event:updateStatus", this.status);
  }
}

/**
 * Sentry crash reporting for the main process.
 *
 * Inits only when `SENTRY_DSN` is set AND the user has granted telemetry
 * consent. Native crashes (minidumps) + uncaught exceptions are uploaded on
 * next launch. The renderer crashes are captured via the sentry-electron
 * main↔renderer pipe (no separate renderer client).
 *
 * No PII. Release tag is the app version; environment is `production` for
 * packaged builds, `development` otherwise.
 */
let mainSentryInitialized = false;

export async function initMainSentry(consent: boolean | null): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (consent !== true) return; // require explicit opt-in
  if (mainSentryInitialized) return;
  try {
    const Sentry = await import("@sentry/electron/main");
    Sentry.init({
      dsn,
      release: `peach-pi@${app.getVersion()}`,
      environment: app.isPackaged ? "production" : "development",
    });
    mainSentryInitialized = true;
  } catch (err) {
    console.warn("[telemetry] Sentry main init failed:", err);
  }
}
