import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import type { McpServer } from "@peach-pi/shared-types";
import { EXECUTOR_MCP_URL, delay, readExecutorToken } from "./executor-daemon.ts";

const execFileAsync = promisify(execFile);

/** pi's enabled-resources file. pi only loads an installed npm package when its
 *  `npm:<name>` spec is listed here; `pi install` adds it. */
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
/** The extension that connects MCP servers (incl. our executor HTTP endpoint)
 *  and exposes `execute`/`resume`. Bundled in node_modules but inert until
 *  enabled here. */
const MCP_ADAPTER_SPEC = "npm:pi-mcp-adapter";

/** GUI apps don't inherit the login-shell PATH — probe common pi install dirs
 *  (mirrors agent-browser-service). */
function findPiBin(): string {
  const candidates = [
    join(homedir(), ".npm-global", "bin", "pi"),
    join(homedir(), ".local", "bin", "pi"),
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "pi";
}

/** pi-mcp-adapter config: `{ "mcpServers": { <name>: { command, args } } }`.
 *  Owned by the adapter. peach-pi toggles load by moving an entry between
 *  `mcpServers` and a peach-managed `peachDisabledMcpServers` map in the same
 *  file. */
const MCP_CONFIG = join(homedir(), ".pi", "agent", "mcp.json");
/** pi-mcp-adapter metadata cache: tool lists per server, keyed by config hash. */
const MCP_CACHE = join(homedir(), ".pi", "agent", "mcp-cache.json");

interface RawServerSpec {
  command?: string;
  args?: string[];
  url?: string;
  auth?: "oauth" | "bearer" | false;
  bearerToken?: string;
  /** pi-mcp-adapter: register this server's tools as NATIVE pi tools (full
   *  cached descriptions, lazy-connect on call) instead of only via the `mcp`
   *  gateway. See `directTools` / direct-tools.ts in pi-mcp-adapter. */
  directTools?: boolean;
  /** Connect at session start and never idle-disconnect, so the metadata
   *  cache that backs direct-tool descriptions stays fresh as the user
   *  adds/removes connections. */
  lifecycle?: "keep-alive" | "lazy" | "eager";
}

interface CacheEntry {
  configHash: string;
  tools?: Array<{ name: string }>;
}

interface CacheShape {
  version: number;
  servers: Record<string, CacheEntry>;
}

function configHash(spec: RawServerSpec): string {
  return createHash("sha256")
    .update(JSON.stringify({ command: spec.command, args: spec.args ?? [] }))
    .digest("hex");
}

/** View of configured MCP servers for the Connections page. peach-pi toggles
 *  load state (disabled servers live in `peachDisabledMcpServers`); the
 *  adapter still owns connections. */
export class McpService {
  async list(): Promise<McpServer[]> {
    let active: Record<string, RawServerSpec>;
    let disabled: Record<string, RawServerSpec>;
    try {
      const raw = JSON.parse(await readFile(MCP_CONFIG, "utf8")) as {
        mcpServers?: Record<string, RawServerSpec>;
        peachDisabledMcpServers?: Record<string, RawServerSpec>;
      };
      active = raw.mcpServers ?? {};
      disabled = raw.peachDisabledMcpServers ?? {};
    } catch {
      return [];
    }

    let cache: CacheShape | null = null;
    try {
      cache = JSON.parse(await readFile(MCP_CACHE, "utf8")) as CacheShape;
      if (!cache || typeof cache.servers !== "object") cache = null;
    } catch {
      cache = null;
    }

    const build = (name: string, spec: RawServerSpec, isDisabled: boolean): McpServer => {
      const command = spec.command
        ? [spec.command, ...(spec.args ?? [])].filter(Boolean).join(" ")
        : (spec.url ?? "");
      const entry = cache?.servers?.[name];
      const fresh = entry?.configHash === configHash(spec);
      return {
        name,
        command,
        toolCount: fresh && Array.isArray(entry?.tools) ? entry!.tools!.length : null,
        connected: fresh,
        disabled: isDisabled,
      };
    };

    const out: McpServer[] = [
      ...Object.entries(active).map(([name, spec]) => build(name, spec, false)),
      ...Object.entries(disabled).map(([name, spec]) => build(name, spec, true)),
    ];
    return out;
  }

  /** Register the bundled Executor MCP server over its daemon's **HTTP
   *  (StreamableHTTP) MCP endpoint**, not the `executor mcp` stdio bridge. The
   *  stdio bridge is broken (both 1.5.25 and 1.5.27): it answers `initialize`
   *  locally but never propagates the MCP `mcp-session-id` to its own daemon,
   *  so every forwarded `tools/list` fails with "Server not initialized" and pi
   *  registers zero Executor tools. The daemon's `/mcp` endpoint is a compliant
   *  StreamableHTTP server that works with a static bearer token.
   *
   *  The caller (`ensureExecutorDaemon`) guarantees the correctly-scoped daemon
   *  is running before this runs; here we only write the HTTP
   *  `mcpServers.executor` entry with the daemon's stable bearer token.
   *  Idempotent: preserves all other keys and leaves a user-disabled entry
   *  alone. */
  async ensureExecutorServer(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Token is created on first daemon start and stable thereafter; retry
      // briefly in case the daemon was only just launched.
      let token = await readExecutorToken();
      for (let i = 0; i < 8 && !token; i++) {
        await delay(250);
        token = await readExecutorToken();
      }

      // directTools + lifecycle(eager): pi-mcp-adapter exposes Executor's
      //   `execute`/`resume` as NATIVE pi tools — present in the agent's tool
      //   list from session 1, with their full description (incl. the live
      //   "Available connection prefixes" block, so Notion/PostHog/etc. are
      //   visible without a manual connect). "eager" connects at startup and
      //   keeps those descriptions fresh as connections change. These flags are
      //   excluded from the adapter's server-identity hash, so adding them does
      //   not invalidate the existing metadata cache.
      const entry: RawServerSpec = {
        url: EXECUTOR_MCP_URL,
        auth: "bearer",
        directTools: true,
        lifecycle: "eager",
        ...(token ? { bearerToken: token } : {}),
      };

      let raw: {
        mcpServers?: Record<string, RawServerSpec>;
        peachDisabledMcpServers?: Record<string, RawServerSpec>;
      };
      try {
        raw = JSON.parse(await readFile(MCP_CONFIG, "utf8"));
      } catch {
        raw = {};
      }
      const active = raw.mcpServers ?? {};
      const disabled = raw.peachDisabledMcpServers ?? {};
      // Respect a deliberate disable; only refresh the entry if active.
      if (disabled.executor) {
        disabled.executor = entry;
        raw.peachDisabledMcpServers = disabled;
      } else {
        active.executor = entry;
        raw.mcpServers = active;
      }
      await writeFile(MCP_CONFIG, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /** Ensure pi actually loads pi-mcp-adapter. The package is bundled into
   *  `~/.pi/agent/npm/node_modules`, but pi's DefaultResourceLoader only loads
   *  it when `npm:pi-mcp-adapter` is listed in settings.json `packages` —
   *  without it the adapter never runs, so the executor `execute`/`resume`
   *  tools never appear no matter how the daemon or mcp.json is set up. Mirrors
   *  the agent-browser pattern: idempotent `pi install` (skipped when already
   *  enabled). Takes effect for sessions started afterwards. */
  async ensureAdapterEnabled(
    emit?: (channel: "event:notice", payload: { message: string; level: "info" | "error" }) => void,
  ): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as { packages?: unknown[] };
      if (Array.isArray(parsed.packages) && parsed.packages.includes(MCP_ADAPTER_SPEC)) return;
    } catch {
      /* no settings yet — fall through and let `pi install` create it */
    }
    try {
      await execFileAsync(findPiBin(), ["install", MCP_ADAPTER_SPEC], {
        timeout: 5 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      emit?.("event:notice", {
        message: `Could not enable pi-mcp-adapter: ${stderr?.slice(-300) || String(err)}`,
        level: "error",
      });
    }
  }

  /** Toggle whether an MCP server is in `mcpServers` (enabled) or moved to the
   *  peach-managed `peachDisabledMcpServers` stash (disabled). Preserves all
   *  other keys in mcp.json. Applies to new sessions. */
  async setEnabled(name: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
      const raw = JSON.parse(await readFile(MCP_CONFIG, "utf8")) as {
        mcpServers?: Record<string, RawServerSpec>;
        peachDisabledMcpServers?: Record<string, RawServerSpec>;
      };
      const active = raw.mcpServers ?? {};
      const stash = raw.peachDisabledMcpServers ?? {};
      if (enabled) {
        if (!stash[name]) return { ok: true };
        active[name] = stash[name];
        delete stash[name];
      } else {
        if (!active[name]) return { ok: true };
        stash[name] = active[name];
        delete active[name];
      }
      raw.mcpServers = active;
      if (Object.keys(stash).length) raw.peachDisabledMcpServers = stash;
      else delete raw.peachDisabledMcpServers;
      await writeFile(MCP_CONFIG, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
