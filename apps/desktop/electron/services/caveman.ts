import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { CavemanState } from "@peach-pi/shared-types";

/** The pi-caveman extension reads its default level from this file. */
const CONFIG_PATH = join(homedir(), ".pi", "agent", "caveman.json");
const DEFAULT_ON_LEVEL = "full";

interface CavemanFile {
  defaultLevel?: string;
  onLevel?: string;
  showStatus?: boolean;
}

async function readFileConfig(): Promise<CavemanFile> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as CavemanFile;
  } catch {
    return {};
  }
}

/** Caveman is "on" when the extension's default level is not "off". */
export async function getCavemanState(): Promise<CavemanState> {
  const cfg = await readFileConfig();
  const onLevel = cfg.onLevel ?? (cfg.defaultLevel && cfg.defaultLevel !== "off" ? cfg.defaultLevel : DEFAULT_ON_LEVEL);
  return { enabled: cfg.defaultLevel !== "off" && cfg.defaultLevel != null, level: onLevel };
}

/** Toggle the default level so new sessions match; preserves the chosen on-level. */
export async function setCavemanEnabled(enabled: boolean): Promise<CavemanState> {
  const cfg = await readFileConfig();
  const onLevel = cfg.onLevel ?? (cfg.defaultLevel && cfg.defaultLevel !== "off" ? cfg.defaultLevel : DEFAULT_ON_LEVEL);
  const next: CavemanFile = {
    ...cfg,
    onLevel,
    defaultLevel: enabled ? onLevel : "off",
  };
  await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { enabled, level: onLevel };
}
