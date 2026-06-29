import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

/**
 * Installs the `peach-secrets` pi extension into the global auto-discovered
 * location (`~/.pi/agent/extensions/`). pi loads it on session start; the
 * extension talks back to peach-pi's BwsResolver over localhost to reach
 * Bitwarden Secrets Manager. Secret values never leave the main process.
 *
 * The extension source is a real, type-checked TypeScript file staged by
 * `scripts/build-extensions.mjs` into `electron/build/extensions/` (run by
 * `pnpm predev` and the Forge `packageAfterCopy` hook). This installer copies
 * that staged asset to the auto-discovered extensions dir on launch.
 *
 * `VERSION` is a runtime reload guard: it only says "is the on-disk file the
 * one this build shipped?" so we don't clobber a freshly loaded copy on every
 * launch. Resolved via `__dirname` per the ADR-0001 CJS rule.
 */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-secrets.ts");
const VERSION = "001";

// Stale extension from the pre-Executor connector system; remove it so its
// dead connector_/custom_ tools no longer load.
const LEGACY_EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-connectors.ts");

const STAGED_ASSET = join(
  __dirname,
  "..",
  "..",
  "electron",
  "build",
  "extensions",
  "peach-secrets.ts",
);

/** Write the extension if missing or out of date. Safe to call on every launch. */
export async function ensureBwsExtension(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true });
  await rm(LEGACY_EXTENSION_PATH, { force: true });
  let existing = "";
  try {
    existing = await readFile(EXTENSION_PATH, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("peach-secrets v" + VERSION)) return;

  const staged = await readFile(STAGED_ASSET, "utf8");
  await writeFile(EXTENSION_PATH, staged, "utf8");
}
