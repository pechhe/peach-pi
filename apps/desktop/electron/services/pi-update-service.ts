import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AppDb } from "../persistence/db.ts";
import { KvRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";
import { getPiSettings } from "./pi-settings.ts";

const execFileAsync = promisify(execFile);

const KV_KEY = "piExtUpdate:lastRun"; // epoch ms of the last successful run
const THROTTLE_MS = 24 * 60 * 60 * 1000; // skip if checked within 24h
const PERIODIC_MS = 12 * 60 * 60 * 1000; // re-check cadence while running
const TIMEOUT_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 5 * 1000; // let the window settle before touching the network

/**
 * Runs `pi update --extensions` in the background: once at startup (throttled)
 * and periodically while the app runs.
 *
 * GUI apps don't inherit the login-shell PATH, so we probe common install dirs
 * for the pi CLI (same problem GraphifyService solves). Updates swap extension
 * module files on disk, which breaks any pi session that imports them mid-run,
 * so every run is gated on `hasActiveRuns` returning false.
 */
export class PiUpdateService {
  private kv: KvRepo;
  private emit: Emit;
  private hasActiveRuns: () => boolean;
  private getProjectRoots: () => string[];
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private running = false;
  /** True when a manual update was requested while runs were active; flushed
   *  by `onRunsIdle()` as soon as no runs remain. */
  private queued = false;
  /** Invoked after an update is applied, so the caller can hot-reload all
   *  idle sessions from the freshly-installed extension files. */
  private onUpdateApplied?: () => void;

  constructor(
    db: AppDb,
    emit: Emit,
    hasActiveRuns: () => boolean,
    getProjectRoots: () => string[] = () => [],
    onUpdateApplied?: () => void,
  ) {
    this.kv = new KvRepo(db);
    this.emit = emit;
    this.hasActiveRuns = hasActiveRuns;
    this.getProjectRoots = getProjectRoots;
    this.onUpdateApplied = onUpdateApplied;
  }

  /** Schedule the throttled boot run + the periodic re-check. */
  start(): void {
    // Check for available updates shortly after boot (regardless of auto-update setting)
    this.bootTimer = setTimeout(() => void this.checkAvailable(), BOOT_DELAY_MS);
    // Also run the auto-update if enabled
    setTimeout(() => void this.maybeUpdate(), BOOT_DELAY_MS + 1000);
    this.timer = setInterval(() => void this.maybeUpdate(), PERIODIC_MS);
  }

  stop(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
    this.bootTimer = null;
    this.timer = null;
  }

  /** Auto path: respects the opt-in setting, the throttle, and active runs. */
  private async maybeUpdate(): Promise<void> {
    const { autoUpdateExtensions } = await getPiSettings();
    if (!autoUpdateExtensions) return;
    const last = this.kv.get<number>(KV_KEY) ?? 0;
    if (Date.now() - last < THROTTLE_MS) return;
    if (this.hasActiveRuns()) return; // defer; the next tick retries
    await this.run(false);
  }

  /** Manual path: bypasses the throttle. When runs are active, queues the
   *  update to be applied automatically as soon as the runs finish, instead
   *  of rejecting the request. */
  async updateNow(): Promise<{ ok: boolean; updated: boolean; queued: boolean; error?: string }> {
    if (this.hasActiveRuns()) {
      this.queued = true;
      this.emit("event:notice", {
        message: "Update queued — will apply when runs finish.",
        level: "info",
      });
      return { ok: true, updated: false, queued: true };
    }
    const res = await this.run(true);
    return { ...res, queued: false };
  }

  /** Called from main when active runs drop to zero. Flushes a queued update
   *  if one is waiting; re-checks `hasActiveRuns` in case a new run started
   *  between the signal and now. */
  onRunsIdle(): void {
    if (!this.queued) return;
    if (this.hasActiveRuns()) return;
    this.queued = false;
    void this.run(true);
  }

  /** Uninstall a package extension via `pi remove <spec>`. */
  async removeExtension(spec: string): Promise<{ ok: boolean; error?: string }> {
    if (this.hasActiveRuns()) {
      return { ok: false, error: "A run is active — try again when idle." };
    }
    try {
      await execFileAsync(findPiBin(), ["remove", spec], {
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      this.emit("event:notice", { message: `Removed ${spec}. Restart to unload.`, level: "info" });
      this.emit("event:resourcesChanged", undefined);
      return { ok: true };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      const error = stderr?.slice(-500) || String(err);
      this.emit("event:notice", { message: `Remove failed: ${error}`, level: "error" });
      return { ok: false, error };
    }
  }

  /**
   * Delete a local extension's file/dir from disk. Validates the target sits
   * directly inside a real `extensions` directory (global or project-local) so
   * a compromised renderer can't ask us to rm an arbitrary path.
   */
  async deleteLocalExtension(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    if (this.hasActiveRuns()) {
      return { ok: false, error: "A run is active — try again when idle." };
    }
    if (!existsSync(targetPath)) return { ok: false, error: "Path no longer exists." };
    let real: string;
    try {
      real = realpathSync(targetPath);
    } catch {
      return { ok: false, error: "Could not resolve path." };
    }
    const parent = path.dirname(real);
    if (path.basename(parent) !== "extensions") {
      return { ok: false, error: "Refusing to delete: not a local extension." };
    }
    // Allow global (~/.pi/agent/extensions) and project-local (<project>/.pi/extensions).
    const allowedRoots = [homedir() + path.sep, ...this.getProjectRoots().map((r) => r + path.sep)];
    if (!allowedRoots.some((root) => real.startsWith(root))) {
      return { ok: false, error: "Refusing to delete: path outside known extension dirs." };
    }
    try {
      await rm(real, { recursive: true, force: true });
      this.emit("event:notice", {
        message: `Deleted ${path.basename(real)}. Restart to unload.`,
        level: "info",
      });
      this.emit("event:resourcesChanged", undefined);
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.emit("event:notice", { message: `Delete failed: ${error}`, level: "error" });
      return { ok: false, error };
    }
  }

  /**
   * Delete a local skill's file/dir from disk. Validates the target's parent
   * sits directly inside a real `skills` directory (global or project-local)
   * so a compromised renderer can't ask us to rm an arbitrary path.
   */
  async deleteSkill(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    if (this.hasActiveRuns()) {
      return { ok: false, error: "A run is active — try again when idle." };
    }
    if (!existsSync(targetPath)) return { ok: false, error: "Path no longer exists." };
    let real: string;
    try {
      real = realpathSync(targetPath);
    } catch {
      return { ok: false, error: "Could not resolve path." };
    }
    const parent = path.dirname(real);
    if (path.basename(parent) !== "skills") {
      return { ok: false, error: "Refusing to delete: not a local skill." };
    }
    const allowedRoots = [homedir() + path.sep, ...this.getProjectRoots().map((r) => r + path.sep)];
    if (!allowedRoots.some((root) => real.startsWith(root))) {
      return { ok: false, error: "Refusing to delete: path outside known skill dirs." };
    }
    try {
      await rm(real, { recursive: true, force: true });
      this.emit("event:notice", {
        message: `Deleted ${path.basename(real)}. Restart to unload.`,
        level: "info",
      });
      this.emit("event:resourcesChanged", undefined);
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.emit("event:notice", { message: `Delete failed: ${error}`, level: "error" });
      return { ok: false, error };
    }
  }

  /**
   * Check for available updates without applying them. Parses `pi list` and
   * npm outdated to detect packages with newer versions, then emits
   * `event:extUpdatesAvailable` with the package names.
   */
  async checkAvailable(): Promise<void> {
    if (this.hasActiveRuns()) return;
    try {
      const piBin = findPiBin();
      const { stdout: listOut } = await execFileAsync(piBin, ["list"], {
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      // Extract npm package names from `pi list` output (lines like "  npm:pi-agent-browser-native")
      const npmPackages: string[] = [];
      for (const line of listOut.split("\n")) {
        const m = line.trim().match(/^npm:(.+)$/);
        if (m?.[1]) npmPackages.push(m[1].trim());
      }
      if (npmPackages.length === 0) return;
      // Check npm outdated for globally-installed packages
      // npm outdated exits non-zero when outdated packages exist; the output is still usable
      let outdatedOut = "";
      try {
        await execFileAsync("npm", ["outdated", "-g"], {
          timeout: TIMEOUT_MS,
          maxBuffer: 8 * 1024 * 1024,
        });
        // If it exits 0, nothing is outdated
        return;
      } catch (err) {
        // Exit 1 = outdated packages exist; stdout has the table
        outdatedOut = (err as { stdout?: string }).stdout ?? "";
      }
      if (!outdatedOut) return;
      const outdated: string[] = [];
      for (const line of outdatedOut.split("\n")) {
        const parts = line.split(/\s+/);
        const pkgName = parts[0];
        if (pkgName && npmPackages.some((p) => p === pkgName || pkgName.endsWith(p))) {
          outdated.push(pkgName);
        }
      }
      if (outdated.length > 0) {
        this.emit("event:extUpdatesAvailable", { packages: outdated });
      }
    } catch (err) {
      console.warn("[pi-update] checkAvailable failed:", err);
    }
  }

  private async run(manual: boolean): Promise<{ ok: boolean; updated: boolean; error?: string }> {
    if (this.running) return { ok: false, updated: false, error: "Already running" };
    this.running = true;
    try {
      const { stdout } = await execFileAsync(findPiBin(), ["update", "--extensions"], {
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      this.kv.set(KV_KEY, Date.now());
      const updated = /updat|install/i.test(stdout) && !/up to date|nothing to/i.test(stdout);
      if (updated) {
        this.emit("event:notice", { message: "Extensions updated. Reloading…", level: "info" });
        // Clear the available-updates badge since we just updated
        this.emit("event:extUpdatesAvailable", { packages: [] });
        // Hot-reload all idle sessions from the freshly-installed files.
        // Running sessions are queued by reloadIdleSessions() and flushed
        // when their run finishes (ThreadService.reloadQueued).
        try {
          this.onUpdateApplied?.();
        } catch (err) {
          console.warn("[pi-update] post-update reload failed:", err);
        }
      } else if (manual) {
        this.emit("event:notice", { message: "Extensions already up to date.", level: "info" });
      }
      return { ok: true, updated };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      const error = stderr?.slice(-500) || String(err);
      if (manual) this.emit("event:notice", { message: `Extension update failed: ${error}`, level: "error" });
      else console.warn("[pi-update]", error);
      return { ok: false, updated: false, error };
    } finally {
      this.running = false;
    }
  }
}

/** GUI apps don't inherit the login-shell PATH — probe common install dirs. */
function findPiBin(): string {
  const candidates = [
    path.join(homedir(), ".npm-global", "bin", "pi"),
    path.join(homedir(), ".local", "bin", "pi"),
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi"; // fall back to PATH lookup at exec time
}
