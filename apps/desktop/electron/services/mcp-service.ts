import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import type { McpServer } from "@peach-pi/shared-types";

/** pi-mcp-adapter config: `{ "mcpServers": { <name>: { command, args } } }`.
 *  Owned by the adapter — peach-pi reads it for display, never writes it. */
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

/** Read-only view of configured MCP servers for the Connections page.
 *  peach-pi does not manage MCP server lifecycles — pi-mcp-adapter does. */
export class McpService {
  async list(): Promise<McpServer[]> {
    let config: Record<string, RawServerSpec>;
    try {
      const raw = JSON.parse(await readFile(MCP_CONFIG, "utf8")) as {
        mcpServers?: Record<string, RawServerSpec>;
      };
      config = raw.mcpServers ?? {};
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

    const out: McpServer[] = [];
    for (const [name, spec] of Object.entries(config)) {
      const command = [spec.command, ...(spec.args ?? [])]
        .filter(Boolean)
        .join(" ");
      const entry = cache?.servers?.[name];
      const fresh = entry?.configHash === configHash(spec);
      out.push({
        name,
        command,
        toolCount: fresh && Array.isArray(entry?.tools) ? entry!.tools!.length : null,
        connected: fresh,
      });
    }
    return out;
  }
}
