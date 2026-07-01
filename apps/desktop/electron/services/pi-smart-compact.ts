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
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelInfo } from "@peach-pi/shared-types";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");

interface RawSmartCompact {
  summaryModel?: unknown;
  [key: string]: unknown;
}
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
