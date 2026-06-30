import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import type { McpServer } from "@peach-pi/shared-types";

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
      const command = [spec.command, ...(spec.args ?? [])].filter(Boolean).join(" ");
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

  /** Ensure the bundled Executor MCP server is registered. Writes an
   *  `mcpServers.executor` entry pointing at the absolute path of the bundled
   *  binary (a Finder-launched app has no shell PATH, so a bare `executor`
   *  won't resolve). `executor mcp` itself attaches to an existing local
   *  daemon or elects a new owner over the default `~/.executor` data dir, so
   *  the user's existing Executor connections appear automatically. Idempotent:
   *  preserves all other keys and leaves a user-disabled entry alone. */
  async ensureExecutorServer(binPath: string): Promise<{ ok: boolean; error?: string }> {
    try {
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
      // Respect a deliberate disable; only refresh the binary path if active.
      if (disabled.executor) {
        disabled.executor = { command: binPath, args: ["mcp"] };
        raw.peachDisabledMcpServers = disabled;
      } else {
        active.executor = { command: binPath, args: ["mcp"] };
        raw.mcpServers = active;
      }
      await writeFile(MCP_CONFIG, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
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
