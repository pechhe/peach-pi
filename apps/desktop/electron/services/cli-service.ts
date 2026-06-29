import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { CliStatus } from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";
import { KNOWN_CLIS, type CliDescriptor } from "./cli-registry.ts";
import { AsyncTtl } from "./ttl-cache.ts";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 4 * 1024 * 1024;
const HIDDEN_FILE = path.join(homedir(), ".pi", "agent", "peach-cli.json");

function readHidden(): Set<string> {
  try {
    const cfg = JSON.parse(readFileSync(HIDDEN_FILE, "utf8")) as { hidden?: string[] };
    return new Set(cfg.hidden ?? []);
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>): void {
  mkdirSync(path.dirname(HIDDEN_FILE), { recursive: true });
  writeFileSync(HIDDEN_FILE, JSON.stringify({ hidden: [...ids] }, null, 2), { mode: 0o600 });
}

/**
 * Detects the known CLIs (presence + auth) and runs each CLI's own interactive
 * login flow. The agent uses these tools through its normal shell + per-CLI
 * skills — peach-pi never wraps them in a model tool, never stores their
 * tokens (auth lives in the CLI's own config, e.g. ~/.vercel), and never
 * injects credentials. This is detection + a login launcher only.
 *
 * GUI apps launch without the login-shell PATH, so a CLI the user installed via
 * npm/homebrew/cargo isn't on `process.env.PATH`. We resolve each binary
 * through the user's login shell (`command -v`), matching BwsService's shell
 * token detection.
 */
export class CliService {
  // Re-opening the Connections page re-fires cli:list; cache the full probe
  // (one spawn per CLI for version + auth) so navigation is instant. Cleared
  // on refresh and after a login launch so the next read is fresh.
  private cache = new AsyncTtl<CliStatus[]>(20_000);
  // Resolved binary paths per id (null = not found), for the process lifetime.
  // Cleared alongside the status cache so a freshly installed CLI is re-found.
  private binPaths = new Map<string, string | null>();

  constructor(private emit: Emit) {}

  /** Detection + auth status for every known CLI (cached). */
  list(): Promise<CliStatus[]> {
    return this.cache.run(() => this.probeAll());
  }

  /** Force a fresh probe now. */
  refresh(): Promise<CliStatus[]> {
    this.cache.clear();
    this.binPaths.clear();
    return this.list();
  }

  /** Hide a CLI from the main list, or restore it. Persisted to peach-cli.json. */
  setHidden(id: string, hidden: boolean): Promise<CliStatus[]> {
    if (!KNOWN_CLIS.some((c) => c.id === id)) throw new Error(`Unknown CLI: ${id}`);
    const ids = readHidden();
    if (hidden) ids.add(id);
    else ids.delete(id);
    writeHidden(ids);
    this.emit("event:clisChanged", undefined);
    return this.refresh();
  }

  /** Launch a CLI's interactive login in a Terminal window (macOS). Browser
   *  flows (vercel/fly/wrangler) and prompt flows (gh) both work there. We
   *  cannot observe when the external login completes, so the cache is dropped
   *  and a change event fired; the user re-checks (or revisits) to see the
   *  flipped badge. */
  async login(id: string): Promise<void> {
    const desc = KNOWN_CLIS.find((c) => c.id === id);
    if (!desc) throw new Error(`Unknown CLI: ${id}`);
    if (process.platform !== "darwin") {
      throw new Error("Automatic login launch is only supported on macOS.");
    }
    // Open Terminal.app running the login command. AppleScript string escaping:
    // backslashes then double-quotes.
    const escaped = desc.loginCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await execFileAsync(
      "osascript",
      ["-e", `tell application "Terminal" to do script "${escaped}"`, "-e", 'tell application "Terminal" to activate'],
      { timeout: PROBE_TIMEOUT_MS },
    );
    this.cache.clear();
    this.binPaths.clear();
    this.emit("event:clisChanged", undefined);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async probeAll(): Promise<CliStatus[]> {
    const hidden = readHidden();
    return Promise.all(KNOWN_CLIS.map((d) => this.probe(d, hidden.has(d.id))));
  }

  private async probe(desc: CliDescriptor, hidden: boolean): Promise<CliStatus> {
    const base = {
      id: desc.id,
      name: desc.name,
      installHint: desc.installHint,
      docsUrl: desc.docsUrl,
      lastCheckedAt: new Date().toISOString(),
      hidden,
    };
    // Hidden CLIs are not probed (the user opted out); skip the spawns.
    if (hidden) {
      return { ...base, installed: false, version: null, authed: false, error: null };
    }
    const bin = await this.findBin(desc.id);
    if (!bin) {
      return { ...base, installed: false, version: null, authed: false, error: null };
    }

    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync(bin, desc.versionArgs, {
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      version = stdout.match(desc.versionRegex)?.[1] ?? null;
    } catch {
      version = null;
    }

    let authed = false;
    let error: string | null = null;
    try {
      const { stdout, stderr } = await execFileAsync(bin, desc.authArgs, {
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      authed = desc.authedRegex ? desc.authedRegex.test(stdout + stderr) : true;
    } catch (e) {
      // Non-zero exit from an auth check = not logged in (the common case);
      // surface the stderr only if it looks like a real failure, not just
      // "you are not logged in".
      authed = false;
      const stderr = (e as { stderr?: string }).stderr?.trim();
      error = stderr && !/log\s?in|auth|credential|token/i.test(stderr) ? stderr.slice(-500) : null;
    }

    return { ...base, installed: true, version, authed, error };
  }

  /** Resolve a binary through the user's login shell so the real PATH (npm
   *  global, homebrew, cargo, …) is honored. Cached per id. */
  private async findBin(id: string): Promise<string | null> {
    const cached = this.binPaths.get(id);
    if (cached !== undefined) return cached;
    const shell = process.env.SHELL || "/bin/zsh";
    let resolved: string | null = null;
    try {
      const { stdout } = await execFileAsync(
        shell,
        ["-lic", `printf 'CLI[%s]CLI' "$(command -v ${id})"`],
        { timeout: 8_000, maxBuffer: 1024 * 1024 },
      );
      const path = stdout.match(/CLI\[([\s\S]*?)\]CLI/)?.[1]?.trim() ?? "";
      resolved = path || null;
    } catch {
      resolved = null;
    }
    this.binPaths.set(id, resolved);
    return resolved;
  }
}
