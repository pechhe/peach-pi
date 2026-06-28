import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Resolve config values (API keys, etc.) the same way pi does
 * (see `core/resolve-config-value.ts` in pi-coding-agent). Reimplemented here
 * rather than imported from pi's dist, so peach-pi stays decoupled from pi's
 * internal module layout but matches its credential conventions exactly.
 *
 *  - leading `!`  → execute the rest as a shell command; use trimmed stdout
 *                   (`!/usr/local/bin/openrouter-key` runs that script)
 *  - `$VAR` / `${VAR}` → interpolate from the environment (any missing var → undefined)
 *  - `$$` → literal `$`, `$!` → literal `!`  (only in non-command values)
 *  - otherwise the value is used literally
 *
 * Command results are cached for the process lifetime, like pi.
 */

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_NAME_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

type Part = { type: "literal"; value: string } | { type: "env"; name: string };

function appendLiteral(parts: Part[], value: string): void {
  if (!value) return;
  const last = parts[parts.length - 1];
  if (last?.type === "literal") last.value += value;
  else parts.push({ type: "literal", value });
}

function parseTemplate(config: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  while (i < config.length) {
    const dollar = config.indexOf("$", i);
    if (dollar < 0) { appendLiteral(parts, config.slice(i)); break; }
    appendLiteral(parts, config.slice(i, dollar));
    const next = config[dollar + 1];
    // Escapes: $$ → $, $! → !
    if (next === "$" || next === "!") { appendLiteral(parts, next); i = dollar + 2; continue; }
    // ${VAR}
    if (next === "{") {
      const end = config.indexOf("}", dollar + 2);
      if (end < 0) { appendLiteral(parts, "$"); i = dollar + 1; continue; }
      const name = config.slice(dollar + 2, end);
      if (ENV_NAME_RE.test(name)) parts.push({ type: "env", name });
      else appendLiteral(parts, config.slice(dollar, end + 1));
      i = end + 1;
      continue;
    }
    // $VAR (bareword prefix)
    const m = config.slice(dollar + 1).match(ENV_NAME_PREFIX_RE);
    if (m) { parts.push({ type: "env", name: m[0] }); i = dollar + 1 + m[0].length; continue; }
    appendLiteral(parts, "$");
    i = dollar + 1;
  }
  return parts;
}

function envVarNames(parts: Part[]): string[] {
  const names: string[] = [];
  for (const p of parts) if (p.type === "env" && !names.includes(p.name)) names.push(p.name);
  return names;
}

function resolveParts(parts: Part[]): string | undefined {
  let out = "";
  for (const p of parts) {
    if (p.type === "literal") { out += p.value; continue; }
    const v = process.env[p.name];
    if (v === undefined) return undefined;
    out += v;
  }
  return out;
}

const commandCache = new Map<string, string | undefined>();

function execute(commandConfig: string): string | undefined {
  if (commandCache.has(commandConfig)) return commandCache.get(commandConfig);
  const cmd = commandConfig.slice(1);
  let result: string | undefined;
  try {
    const out = execSync(cmd, {
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    result = out.trim() || undefined;
  } catch {
    result = undefined;
  }
  commandCache.set(commandConfig, result);
  return result;
}

const execFileAsync = promisify(execFile);

/** Async execute: same semantics + cache as `execute()`, but runs the command
 *  on the libuv threadpool via `execFile` instead of `execSync`. Used from
 *  async credential resolution so a slow `!cmd` API-key source never blocks
 *  the Electron main thread (a 10s `execSync` would freeze all IPC). */
async function executeAsync(commandConfig: string): Promise<string | undefined> {
  const cached = commandCache.get(commandConfig);
  if (cached !== undefined || commandCache.has(commandConfig)) return cached;
  const cmd = commandConfig.slice(1);
  let result: string | undefined;
  try {
    const { stdout } = await execFileAsync(cmd, {
      encoding: "utf-8",
      timeout: 10_000,
      shell: true,
    });
    result = stdout.trim() || undefined;
  } catch {
    result = undefined;
  }
  commandCache.set(commandConfig, result);
  return result;
}

/** Resolve a raw config value to an actual string (or undefined on failure). */
export function resolveConfigValue(config: string | undefined): string | undefined {
  if (!config) return undefined;
  if (config.startsWith("!")) return execute(config);
  return resolveParts(parseTemplate(config));
}

/** Async variant: uses `execFile` for `!cmd` values so the main thread isn't
 *  blocked during credential resolution. Env-var / literal paths resolve
 *  synchronously inside the promise. Prefer this from any async context. */
export async function resolveConfigValueAsync(
  config: string | undefined,
): Promise<string | undefined> {
  if (!config) return undefined;
  if (config.startsWith("!")) return executeAsync(config);
  return resolveParts(parseTemplate(config));
}

/** Resolve and throw a clear error if it can't be resolved. */
export function resolveConfigValueOrThrow(config: string | undefined, description: string): string {
  const v = resolveConfigValue(config);
  if (v !== undefined) return v;
  if (config?.startsWith("!")) {
    throw new Error(`Failed to resolve ${description} from shell command: ${config.slice(1)}`);
  }
  const missing = envVarNames(parseTemplate(config ?? "")).filter((n) => process.env[n] === undefined);
  if (missing.length) {
    throw new Error(`Failed to resolve ${description}: env var ${missing.join(", ")} not set`);
  }
  throw new Error(`Failed to resolve ${description}`);
}

/** Async `resolveConfigValueOrThrow`: throws the same messages, but resolves
 *  `!cmd` values off the main thread. */
export async function resolveConfigValueOrThrowAsync(
  config: string | undefined,
  description: string,
): Promise<string> {
  const v = await resolveConfigValueAsync(config);
  if (v !== undefined) return v;
  if (config?.startsWith("!")) {
    throw new Error(`Failed to resolve ${description} from shell command: ${config.slice(1)}`);
  }
  const missing = envVarNames(parseTemplate(config ?? "")).filter((n) => process.env[n] === undefined);
  if (missing.length) {
    throw new Error(`Failed to resolve ${description}: env var ${missing.join(", ")} not set`);
  }
  throw new Error(`Failed to resolve ${description}`);
}

/** Whether a raw value is configured WITHOUT executing shell commands:
 *  `!cmd` → true (don't pre-execute); `$VAR` → env var set; literal → non-empty. */
export function isConfigValueConfigured(config: string | undefined): boolean {
  if (!config) return false;
  if (config.startsWith("!")) return true;
  const missing = envVarNames(parseTemplate(config)).filter((n) => process.env[n] === undefined);
  return missing.length === 0;
}
