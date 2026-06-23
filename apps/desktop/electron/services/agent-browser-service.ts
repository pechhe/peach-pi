import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { AgentBrowserState } from "@peach-pi/shared-types";

const execFileAsync = promisify(execFile);

const AGENT_DIR = path.join(homedir(), ".pi", "agent");
const SETTINGS_PATH = path.join(AGENT_DIR, "settings.json");
const SPEC = "npm:pi-agent-browser-native";
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/** GUI apps don't inherit the login-shell PATH — probe common pi install dirs. */
function findPiBin(): string {
  const candidates = [
    path.join(homedir(), ".npm-global", "bin", "pi"),
    path.join(homedir(), ".local", "bin", "pi"),
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi";
}

type Emit = (channel: "event:notice", payload: { message: string; level: "info" | "error" }) => void;

/**
 * Ensures the `pi-agent-browser-native` package is installed so pi exposes the
 * native `agent_browser` tool (ADR-0008) — replacing brittle `agent-browser`
 * shell commands with a typed, validated tool. Mirrors the vision-proxy
 * pattern: read install state from settings.json `packages`, install via
 * `pi install npm:pi-agent-browser-native` (idempotent), emit a notice.
 *
 * The package itself does not bundle the upstream `agent-browser` engine; that
 * binary must be on PATH separately (the skill still teaches CLI usage).
 */
export class AgentBrowserService {
  /** Whether `npm:pi-agent-browser-native` is in pi's `packages[]`, and the
   *  upstream `agent-browser` engine binary is on PATH (the native tool is a
   *  thin wrapper — it shells out to that binary). */
  async state(): Promise<AgentBrowserState> {
    let binaryVersion: string | null = null;
    try {
      // The native tool relies on the bundled `agent_browser` binary; probe it
      // the same way pi-agent-browser-native's doctor does.
      const { stdout } = await execFileAsync("agent-browser", ["--version"], {
        timeout: 5000,
        maxBuffer: 1 * 1024 * 1024,
      });
      binaryVersion = stdout.trim() || null;
    } catch {
      binaryVersion = null;
    }
    let installed = false;
    try {
      const raw = await readFile(SETTINGS_PATH, "utf8");
      const parsed = JSON.parse(raw) as { packages?: unknown[] };
      const packages = Array.isArray(parsed.packages) ? parsed.packages : [];
      installed = packages.some((p) => p === SPEC);
    } catch {
      installed = false;
    }
    return { installed, binaryVersion };
  }

  /** Install the package. Idempotent — pi skips when already present. */
  async install(emit: Emit): Promise<{ ok: boolean; error?: string }> {
    try {
      await execFileAsync(findPiBin(), ["install", SPEC], {
        timeout: INSTALL_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      emit("event:notice", {
        message: "Installed pi-agent-browser-native. Restart pi to load the agent_browser tool.",
        level: "info",
      });
      return { ok: true };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      const error = stderr?.slice(-500) || String(err);
      emit("event:notice", {
        message: `Could not install pi-agent-browser-native: ${error}`,
        level: "error",
      });
      return { ok: false, error };
    }
  }
}
