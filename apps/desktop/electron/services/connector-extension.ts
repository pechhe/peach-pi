import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Installs the `peach-connectors` pi extension into the global auto-discovered
 * location (`~/.pi/agent/extensions/`). pi loads it on session start; the
 * extension talks back to peach-pi's ConnectorResolver over localhost, which
 * proxies to Composio / custom HTTP connections / Bitwarden Secrets Manager.
 * The Composio API key never leaves the main process.
 *
 * The extension source is a real, type-checked TypeScript file staged by
 * `scripts/build-extensions.mjs` into `electron/build/extensions/` (run by
 * `pnpm predev` and the Forge `packageAfterCopy` hook). This installer copies
 * that staged asset to the auto-discovered extensions dir on launch.
 *
 * `VERSION` is a runtime reload guard (not a drift detector — the typed tools
 * contract in `@peach-pi/shared-types` enforces drift at compile time). It only
 * says "is the on-disk file the one this build shipped?" so we don't clobber a
 * freshly loaded copy or a user's local edit on every launch. Resolved via
 * `__dirname` per the ADR-0001 CJS rule (never `import.meta.dirname`).
 */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-connectors.ts");
const VERSION = "007";

// Staged asset path. In dev the main bundle is at `.vite/build/main.js`; in a
// packaged app the same relative layout ships under the app source tree. The
// build step writes the asset to `electron/build/extensions/`.
const STAGED_ASSET = join(
  __dirname,
  "..",
  "..",
  "electron",
  "build",
  "extensions",
  "peach-connectors.ts",
);

/** Write the extension if missing or out of date. Safe to call on every launch. */
export async function ensureConnectorExtension(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true });
  let existing = "";
  try {
    existing = await readFile(EXTENSION_PATH, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("peach-connectors v" + VERSION)) return;

  const staged = await readFile(STAGED_ASSET, "utf8");
  await writeFile(EXTENSION_PATH, staged, "utf8");
}
