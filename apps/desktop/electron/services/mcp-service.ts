import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  url?: string;
  auth?: "oauth" | "bearer" | false;
  bearerToken?: string;
}

/** Default Executor daemon endpoint. The daemon always binds this port (the
 *  desktop app and `executor call` both launch it with `--port 4788`), and its
 *  MCP surface is served at `/mcp`. */
const EXECUTOR_PORT = 4788;
const EXECUTOR_MCP_URL = `http://localhost:${EXECUTOR_PORT}/mcp`;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True if a TCP connection to `host:port` opens within `timeoutMs`. */
function canConnect(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((res) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      res(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Reads the stable Executor bearer token from
 *  `~/.executor/server-control/auth.json` (honoring `EXECUTOR_DATA_DIR`). The
 *  token persists across daemon restarts. */
async function readExecutorToken(): Promise<string | null> {
  try {
    const dataDir = resolve(process.env.EXECUTOR_DATA_DIR ?? join(homedir(), ".executor"));
    const raw = await readFile(join(dataDir, "server-control", "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
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

  /** Ensure the bundled Executor MCP server is registered.
   *
   *  We register Executor over its daemon's **HTTP (StreamableHTTP) MCP
   *  endpoint**, not the `executor mcp` stdio bridge. The stdio bridge is
   *  broken (both 1.5.25 and 1.5.27): it answers `initialize` locally but never
   *  propagates the MCP `mcp-session-id` to its own daemon, so every forwarded
   *  `tools/list` fails with "Server not initialized" and pi registers zero
   *  Executor tools. The daemon's `/mcp` endpoint is a compliant StreamableHTTP
   *  server that works with a static bearer token.
   *
   *  So we: (1) make sure the daemon is running (the bridge used to auto-spawn
   *  it; now we do), and (2) write an HTTP `mcpServers.executor` entry with the
   *  daemon's stable bearer token. Idempotent: preserves all other keys and
   *  leaves a user-disabled entry alone. */
  async ensureExecutorServer(binPath: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureDaemon(binPath);

      // Token is created on first daemon start and stable thereafter; retry
      // briefly in case the daemon we just launched hasn't written it yet.
      let token = await readExecutorToken();
      for (let i = 0; i < 8 && !token; i++) {
        await delay(250);
        token = await readExecutorToken();
      }

      const entry: RawServerSpec = {
        url: EXECUTOR_MCP_URL,
        auth: "bearer",
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

  /** Ensure the Executor daemon is listening on the default port. The daemon
   *  owns `~/.executor` and holds every credential; it persists across app and
   *  pi sessions. Spawned detached + unref'd so it outlives us, matching the
   *  bridge's old auto-spawn behavior. No-op if one is already up (Executor's
   *  own owner-lock also prevents duplicates on the same data dir). */
  private async ensureDaemon(binPath: string): Promise<void> {
    if (await canConnect("localhost", EXECUTOR_PORT)) return;
    const child = spawn(
      binPath,
      ["daemon", "run", "--port", String(EXECUTOR_PORT), "--hostname", "localhost", "--foreground"],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    // Poll for readiness up to ~10s.
    for (let i = 0; i < 40; i++) {
      if (await canConnect("localhost", EXECUTOR_PORT)) return;
      await delay(250);
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
