/**
 * Backs the compaction-model picker in the Auto-compaction Settings section.
 *
 * Smart auto-compaction (the `pi-smart-compact` extension, driven by the local
 * `pi-smart-auto-compact` wrapper) generates its summary via a model resolved
 * from `~/.pi/agent/settings.json` `smartCompact.summaryModel` — a
 * "provider/model" string; null/unset falls back to the active session model.
 * The extension resolves it through the model registry, so the value must be
 * one the registry knows (i.e. a scoped model).
 *
 * We read/write only that key, merge-preserving the rest of the file — the same
 * pattern `pi-settings.ts` uses for the GUI subset of `settings.json`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AutoCompactSettings, ModelInfo } from "@peach-pi/shared-types";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");

interface RawSmartCompact {
  summaryModel?: unknown;
  minContextPercent?: unknown;
  minTokenThreshold?: unknown;
  [key: string]: unknown;
}

/** Default trigger percent enforced by the `pi-smart-auto-compact` extension
 *  when `smartCompact.minContextPercent` is unset (mirrors its DEFAULT_SETTINGS). */
const DEFAULT_MIN_CONTEXT_PERCENT = 60;
interface RawSettings {
  smartCompact?: RawSmartCompact;
  [key: string]: unknown;
}

async function readRaw(): Promise<RawSettings> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as RawSettings;
  } catch {
    return {};
  }
}

function readRawSync(): RawSettings {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as RawSettings;
  } catch {
    return {};
  }
}

/** Read the smart auto-compaction thresholds the `pi-smart-auto-compact`
 *  extension actually enforces (`smartCompact.minContextPercent` /
 *  `minTokenThreshold`). Sync so `AppService.getAutoCompact` stays synchronous —
 *  the extension itself reads this file synchronously on every turn. */
export function getAutoCompactThresholds(): AutoCompactSettings {
  const sc = readRawSync().smartCompact ?? {};
  const percent =
    typeof sc.minContextPercent === "number" && Number.isFinite(sc.minContextPercent)
      ? Math.max(1, Math.min(100, Math.round(sc.minContextPercent)))
      : DEFAULT_MIN_CONTEXT_PERCENT;
  const tokens =
    typeof sc.minTokenThreshold === "number" && sc.minTokenThreshold > 0
      ? Math.round(sc.minTokenThreshold)
      : null;
  return { percent, tokens };
}

/** Persist the thresholds into the `smartCompact` block, merge-preserving the
 *  rest of the block (e.g. summaryModel, autoTrigger) and the file. A null/0
 *  token cap clears the key → percentage-only trigger. */
export function setAutoCompactThresholds(settings: AutoCompactSettings): AutoCompactSettings {
  const raw = readRawSync();
  const block: RawSmartCompact = { ...(raw.smartCompact ?? {}) };
  block.minContextPercent = Math.max(1, Math.min(100, Math.round(settings.percent)));
  if (settings.tokens != null && settings.tokens > 0) block.minTokenThreshold = Math.round(settings.tokens);
  else delete block.minTokenThreshold;
  raw.smartCompact = block;
  mkdirSync(AGENT_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return getAutoCompactThresholds();
}

/** Parse a "provider/model" string. Returns null when unset/malformed. */
function parseModelId(value: unknown): { provider: string; id: string } | null {
  if (typeof value !== "string") return null;
  const idx = value.indexOf("/");
  if (idx <= 0 || idx >= value.length - 1) return null;
  return { provider: value.slice(0, idx), id: value.slice(idx + 1) };
}

const formatModelId = (provider: string, id: string): string => `${provider}/${id}`;

/** Read `smartCompact.summaryModel`, resolving the display name from the model
 *  registry (falls back to the id when the model is unscoped/unknown). */
export async function getCompactionModel(): Promise<ModelInfo | null> {
  const raw = await readRaw();
  const parsed = parseModelId(raw.smartCompact?.summaryModel);
  if (!parsed) return null;
  const { listAvailableModels } = await import("@peach-pi/pi-client");
  const models = await listAvailableModels();
  const match = models.find((m) => m.provider === parsed.provider && m.id === parsed.id);
  return { provider: parsed.provider, id: parsed.id, name: match?.name ?? parsed.id };
}

/** Persist `smartCompact.summaryModel`. null clears the key → active model. */
export async function setCompactionModel(model: ModelInfo | null): Promise<ModelInfo | null> {
  const raw = await readRaw();
  const block: RawSmartCompact = { ...(raw.smartCompact ?? {}) };
  if (model) block.summaryModel = formatModelId(model.provider, model.id);
  else delete block.summaryModel;
  // Drop the smartCompact block entirely when empty so clearing the last key
  // doesn't leave a stale `{}` behind in settings.json.
  if (Object.keys(block).length === 0) delete raw.smartCompact;
  else raw.smartCompact = block;

  await mkdir(AGENT_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return getCompactionModel();
}
