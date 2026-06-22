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

  constructor(
    db: AppDb,
    emit: Emit,
    hasActiveRuns: () => boolean,
    getProjectRoots: () => string[] = () => [],
  ) {
    this.kv = new KvRepo(db);
    this.emit = emit;
    this.hasActiveRuns = hasActiveRuns;
    this.getProjectRoots = getProjectRoots;
  }

  /** Schedule the throttled boot run + the periodic re-check. */
  start(): void {
    this.bootTimer = setTimeout(() => void this.maybeUpdate(), BOOT_DELAY_MS);
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

  /** Manual path: bypasses the throttle, still defers while runs are active. */
  async updateNow(): Promise<{ ok: boolean; updated: boolean; error?: string }> {
    if (this.hasActiveRuns()) {
      return { ok: false, updated: false, error: "A run is active — try again when idle." };
    }
    return this.run(true);
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
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.emit("event:notice", { message: `Delete failed: ${error}`, level: "error" });
      return { ok: false, error };
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
        this.emit("event:notice", { message: "Extensions updated. Restart to load.", level: "info" });
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
