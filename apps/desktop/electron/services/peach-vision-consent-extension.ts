import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Installs the `peach-vision-consent` pi extension into the global
 * auto-discovered location (`~/.pi/agent/extensions/`). It makes the
 * `pi-vision-proxy` data-egress consent prompt fire at most once per 24 hours
 * per provider, instead of every session, without modifying the upstream
 * `npm:pi-vision-proxy` package (which `pi install` can replace at any time).
 *
 * Why a separate peach extension: peach-pi does not bundle pi-vision-proxy —
 * it shells out to `pi install npm:pi-vision-proxy`, so patching the installed
 * package in node_modules would not survive a reinstall/upgrade. This extension
 * is peach-pi-owned source written to disk (like peach-secrets /
 * peach-cua-driver), so it is durable.
 *
 * How it works:
 *  - pi loads extensions in order: project-local → global (agentDir/extensions,
 *    where this file lands) → npm packages (pi-vision-proxy). So this
 *    extension's handlers run before pi-vision-proxy's for every shared event.
 *  - `session_start` runs to completion before any `before_agent_start`. If we
 *    have a fresh (within 24h) recorded grant for the active provider, we append
 *    a `vision-proxy-consent` {granted:true, provider} entry here, so
 *    pi-vision-proxy's `hasConsent()` returns true and it skips its prompt.
 *  - `before_agent_start` watches for a consent grant written by pi-vision-proxy
 *    (from its own prompt or `/vision-proxy consent yes`) and persists the
 *    timestamp, refreshing the rolling 24h window. A revocation clears it.
 *
 * State lives at `~/.pi/agent/peach-vision-consent.json`: { provider → epochMs }.
 * The provider is read from `~/.pi/agent/vision-proxy.json` (or the
 * PI_VISION_PROXY_MODEL env override), matching what pi-vision-proxy resolves.
 *
 * The extension source is embedded here (not a packaged asset) so packaging
 * stays simple and the version we ship is the version that runs. We only
 * rewrite the file when our VERSION marker changes.
 */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-vision-consent.ts");
const VERSION = "001";

// NOTE: no backticks / no ${} inside this string — keeps embedding clean.
// Plain TS, run by pi's strip-types loader.
const EXTENSION_SOURCE = [
  "// AUTO-INSTALLED by peach-pi (peach-vision-consent v" + VERSION + ").",
  "// Source: apps/desktop/electron/services/peach-vision-consent-extension.ts",
  'import { readFile, writeFile, mkdir } from "node:fs/promises";',
  'import { homedir } from "node:os";',
  'import { dirname, join } from "node:path";',
  'import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";',
  "",
  "const AGENT_DIR = join(homedir(), \".pi\", \"agent\");",
  "const CONFIG_PATH = join(AGENT_DIR, \"vision-proxy.json\");",
  "const STATE_PATH = join(AGENT_DIR, \"peach-vision-consent.json\");",
  "const CONSENT_TYPE = \"vision-proxy-consent\";",
  "const TTL_MS = 24 * 60 * 60 * 1000;",
  "const DEFAULT_PROVIDER = \"anthropic\";",
  "",
  "interface ConsentData { granted: boolean; provider?: string }",
  "type StateMap = Record<string, number>;",
  "",
  "// Last persisted grant state per provider, so we only write on a flip.",
  "const lastGranted = new Map<string, boolean>();",
  "",
  "async function readJson<T>(p: string): Promise<T | null> {",
  "  try { return JSON.parse(await readFile(p, \"utf8\")) as T; } catch { return null; }",
  "}",
  "",
  "async function writeJson(p: string, v: unknown): Promise<void> {",
  "  try { await mkdir(dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + \"\\n\", \"utf8\"); } catch {}",
  "}",
  "",
  "// Resolve the active vision provider the same way pi-vision-proxy does:",
  "// PI_VISION_PROXY_MODEL env (provider/model-id) wins, then the persistent",
  "// vision-proxy.json, then the default.",
  "async function resolveProvider(): Promise<string> {",
  "  const envModel = process.env.PI_VISION_PROXY_MODEL;",
  "  if (envModel) {",
  "    const slash = envModel.indexOf(\"/\");",
  "    if (slash > 0 && slash < envModel.length - 1) return envModel.slice(0, slash);",
  "  }",
  "  const cfg = await readJson<{ provider?: string }>(CONFIG_PATH);",
  "  if (cfg && typeof cfg.provider === \"string\" && cfg.provider) return cfg.provider;",
  "  return DEFAULT_PROVIDER;",
  "}",
  "",
  "// Mirror pi-vision-proxy hasConsent per-provider semantics over session",
  "// entries: most-recent matching consent entry wins; a provider-less grant",
  "// does NOT satisfy a per-provider check; a provider-less revoke blocks all.",
  "function effectiveGranted(entries: readonly SessionEntry[], provider: string): boolean {",
  "  for (let i = entries.length - 1; i >= 0; i--) {",
  "    const e = entries[i] as { type?: string; customType?: string; data?: unknown } | undefined;",
  "    if (!e || e.type !== \"custom\" || e.customType !== CONSENT_TYPE) continue;",
  "    const d = e.data as ConsentData | undefined;",
  "    if (!d) continue;",
  "    if (!d.granted) {",
  "      if (!d.provider || d.provider === provider) return false;",
  "      continue;",
  "    }",
  "    if (d.provider === provider) return true;",
  "    continue;",
  "  }",
  "  return false;",
  "}",
  "",
  "export default function (pi: ExtensionAPI) {",
  "  // session_start fires once per session and fully completes before any",
  "  // before_agent_start. If we have a fresh 24h grant on record, silently",
  "  // satisfy pi-vision-proxy's consent check for this session (no prompt).",
  "  pi.on(\"session_start\", async () => {",
  "    try {",
  "      const provider = await resolveProvider();",
  "      const state = (await readJson<StateMap>(STATE_PATH)) ?? {};",
  "      const ts = state[provider];",
  "      if (typeof ts === \"number\" && Number.isFinite(ts) && Date.now() - ts < TTL_MS) {",
  "        pi.appendEntry(CONSENT_TYPE, { granted: true, provider });",
  "        lastGranted.set(provider, true);",
  "      }",
  "    } catch {}",
  "  });",
  "",
  "  // before_agent_start fires every turn. When pi-vision-proxy records a",
  "  // grant (its own prompt or `/vision-proxy consent yes`) we persist the",
  "  // timestamp, refreshing the rolling 24h window; a revocation clears it.",
  "  // We write only when the effective grant state flips, to avoid disk IO",
  "  // every turn.",
  "  pi.on(\"before_agent_start\", async (_event, ctx) => {",
  "    try {",
  "      const provider = await resolveProvider();",
  "      const entries = ctx.sessionManager.getEntries();",
  "      const granted = effectiveGranted(entries, provider);",
  "      if (lastGranted.get(provider) === granted) return;",
  "      const state = (await readJson<StateMap>(STATE_PATH)) ?? {};",
  "      if (granted) {",
  "        state[provider] = Date.now();",
  "        await writeJson(STATE_PATH, state);",
  "      } else {",
  "        if (provider in state) {",
  "          delete state[provider];",
  "          await writeJson(STATE_PATH, state);",
  "        }",
  "      }",
  "      lastGranted.set(provider, granted);",
  "    } catch {}",
  "  });",
  "}",
].join("\n");

/** Write the extension if missing or out of date. Safe to call on every launch. */
export async function ensurePeachVisionConsentExtension(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true });
  let existing = "";
  try {
    existing = await readFile(EXTENSION_PATH, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("peach-vision-consent v" + VERSION)) return;
  await writeFile(EXTENSION_PATH, EXTENSION_SOURCE, "utf8");
}
