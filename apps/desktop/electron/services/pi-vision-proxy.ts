/**
 * Backs the "Vision proxy" Settings section.
 *
 * `pi-vision-proxy` is a pi extension (npm:pi-vision-proxy) that routes images
 * to a vision-capable model, persists descriptions, and injects them into the
 * agent's context — so text-only models can "see" images.
 *
 * The extension's runtime config lives at `~/.pi/agent/vision-proxy.json` and
 * is merged over built-in defaults on read. We only need to read/write the keys
 * the GUI controls; the extension fills in the rest. This mirrors how
 * `pi-settings.ts` treats `~/.pi/agent/settings.json` (merge, preserve unknown
 * keys) and how `pi-update-service.ts` shells out to the `pi` CLI to install.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ModelInfo,
  VisionProxyConfig,
  VisionProxyInstallState,
} from "@peach-pi/shared-types";
import type { Emit } from "../ipc/registry.ts";

const execFileAsync = promisify(execFile);

const AGENT_DIR = path.join(homedir(), ".pi", "agent");
const CONFIG_PATH = path.join(AGENT_DIR, "vision-proxy.json");
const SETTINGS_PATH = path.join(AGENT_DIR, "settings.json");
const VISION_PROXY_SPEC = "npm:pi-vision-proxy";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL_ID = "claude-sonnet-4-5";

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

/** Read `packages` from ~/.pi/agent/settings.json to check for vision-proxy. */
export async function getVisionProxyInstallState(): Promise<VisionProxyInstallState> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as { packages?: unknown[] };
    const packages = Array.isArray(parsed.packages) ? parsed.packages : [];
    return { installed: packages.some((p) => p === VISION_PROXY_SPEC) };
  } catch {
    return { installed: false };
  }
}

/** Install `npm:pi-vision-proxy` via `pi install`. Emits a notice on completion. */
export async function installVisionProxy(emit: Emit): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileAsync(findPiBin(), ["install", VISION_PROXY_SPEC], {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    emit("event:notice", {
      message: "Installed pi-vision-proxy. Restart pi to load.",
      level: "info",
    });
    return { ok: true };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    const error = stderr?.slice(-500) || String(err);
    emit("event:notice", {
      message: `Could not install pi-vision-proxy: ${error}`,
      level: "error",
    });
    return { ok: false, error };
  }
}

interface RawVisionConfig {
  mode?: string;
  provider?: string;
  modelId?: string;
  [key: string]: unknown;
}

async function readRawConfig(): Promise<RawVisionConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as RawVisionConfig;
  } catch {
    return {};
  }
}

function isMode(v: unknown): v is VisionProxyConfig["mode"] {
  return v === "fallback" || v === "always" || v === "off";
}

/**
 * Read the GUI-relevant config. The extension merges this file over its own
 * defaults, so missing keys are filled in here for display. We do NOT validate
 * provider/modelId against the model registry — the extension does that and
 * falls back to its default if the stored model is missing/unauthenticated.
 */
export async function getVisionProxyConfig(): Promise<VisionProxyConfig> {
  const [{ installed }, raw] = await Promise.all([
    getVisionProxyInstallState(),
    readRawConfig(),
  ]);

  const mode = isMode(raw.mode) ? raw.mode : "fallback";
  const provider =
    typeof raw.provider === "string" && raw.provider ? raw.provider : DEFAULT_PROVIDER;
  const modelId =
    typeof raw.modelId === "string" && raw.modelId ? raw.modelId : DEFAULT_MODEL_ID;

  return {
    installed,
    mode,
    provider,
    modelId,
    modeLocked: Boolean(process.env.PI_VISION_PROXY_MODE),
    modelLocked: Boolean(process.env.PI_VISION_PROXY_MODEL),
  };
}

async function writeRawConfig(patch: Partial<RawVisionConfig>): Promise<void> {
  const raw = await readRawConfig();
  const next = { ...raw, ...patch };
  await mkdir(AGENT_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** Persist the vision model choice (provider + id) to vision-proxy.json. */
export async function setVisionProxyModel(model: ModelInfo): Promise<VisionProxyConfig> {
  await writeRawConfig({ provider: model.provider, modelId: model.id });
  return getVisionProxyConfig();
}

/** Persist the proxy mode to vision-proxy.json. */
export async function setVisionProxyMode(mode: VisionProxyConfig["mode"]): Promise<VisionProxyConfig> {
  await writeRawConfig({ mode });
  return getVisionProxyConfig();
}
