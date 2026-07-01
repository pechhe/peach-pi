import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { PiSettings, RetrySettings } from "@peach-pi/shared-types";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

const DEFAULT_RETRY: RetrySettings = {
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 2000,
  provider: {
    timeoutMs: null,
    maxRetries: 0,
    maxRetryDelayMs: 60000,
  },
};

const DEFAULTS: PiSettings = {
  retry: DEFAULT_RETRY,
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  autoUpdateExtensions: true,
  insomnia: false,
  telemetryConsent: null,
  topbar: { devtap: true, fallow: true },
};

interface RawSettingsFile {
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
    provider?: {
      timeoutMs?: number | null;
      maxRetries?: number;
      maxRetryDelayMs?: number;
    };
  };
  steeringMode?: string;
  followUpMode?: string;
  autoUpdateExtensions?: boolean;
  insomnia?: boolean;
  telemetryConsent?: boolean | null;
  topbar?: { devtap?: boolean; fallow?: boolean };
  compaction?: { enabled?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

async function readRaw(): Promise<RawSettingsFile> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as RawSettingsFile;
  } catch {
    return {};
  }
}

/** Extract the GUI-relevant subset, filling defaults. */
export async function getPiSettings(): Promise<PiSettings> {
  const raw = await readRaw();
  const retry: RetrySettings = {
    enabled: raw.retry?.enabled ?? DEFAULT_RETRY.enabled,
    maxRetries: raw.retry?.maxRetries ?? DEFAULT_RETRY.maxRetries,
    baseDelayMs: raw.retry?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
    provider: {
      timeoutMs: raw.retry?.provider?.timeoutMs ?? DEFAULT_RETRY.provider.timeoutMs,
      maxRetries: raw.retry?.provider?.maxRetries ?? DEFAULT_RETRY.provider.maxRetries,
      maxRetryDelayMs:
        raw.retry?.provider?.maxRetryDelayMs ?? DEFAULT_RETRY.provider.maxRetryDelayMs,
    },
  };
  return {
    retry,
    steeringMode: (raw.steeringMode as PiSettings["steeringMode"]) ?? DEFAULTS.steeringMode,
    followUpMode: (raw.followUpMode as PiSettings["followUpMode"]) ?? DEFAULTS.followUpMode,
    autoUpdateExtensions: raw.autoUpdateExtensions ?? DEFAULTS.autoUpdateExtensions,
    insomnia: raw.insomnia ?? DEFAULTS.insomnia,
    telemetryConsent: raw.telemetryConsent ?? DEFAULTS.telemetryConsent,
    topbar: {
      devtap: raw.topbar?.devtap ?? DEFAULTS.topbar.devtap,
      fallow: raw.topbar?.fallow ?? DEFAULTS.topbar.fallow,
    },
  };
}

function applyCompactionFlag(raw: RawSettingsFile): void {
  // The SDK's auto-compaction must stay off; enforced here so any write path
  // through this module keeps it disabled (see ensureCompactionDisabled).
  if (raw.compaction?.enabled === false) return;
  raw.compaction = { ...raw.compaction, enabled: false };
}

/** Merge a partial patch into the settings file, preserving unknown keys. */
export async function setPiSettings(patch: Partial<PiSettings>): Promise<PiSettings> {
  const raw = await readRaw();

  if (patch.retry) {
    raw.retry = {
      ...raw.retry,
      ...patch.retry,
      provider: {
        ...raw.retry?.provider,
        ...patch.retry.provider,
      },
    };
  }
  if (patch.steeringMode !== undefined) raw.steeringMode = patch.steeringMode;
  if (patch.followUpMode !== undefined) raw.followUpMode = patch.followUpMode;
  if (patch.autoUpdateExtensions !== undefined)
    raw.autoUpdateExtensions = patch.autoUpdateExtensions;
  if (patch.insomnia !== undefined) raw.insomnia = patch.insomnia;
  if (patch.telemetryConsent !== undefined) raw.telemetryConsent = patch.telemetryConsent;
  if (patch.topbar) {
    raw.topbar = {
      ...(raw.topbar as { devtap?: boolean; fallow?: boolean } | undefined),
      ...patch.topbar,
    };
  }
  applyCompactionFlag(raw);

  await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  return getPiSettings();
}

/** Enforce that the SDK's built-in auto-compaction trigger stays disabled.
 *  That path estimates tokens on error messages and compacts even when the
 *  "error" is a dropped connection (so it fires during a network outage and
 *  its own summarization call then fails too). Auto-compaction of the
 *  `pi-smart-auto-compact` extension (clean turn_end + real usage tokens) is
 *  the sole trigger, so this must stay off. Best-effort: a read/write failure
 *  never blocks boot. */
export async function ensureCompactionDisabled(): Promise<void> {
  const raw = await readRaw();
  applyCompactionFlag(raw);
  await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}
