import { execFile } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  ExecCatalogueItem,
  ExecConnection,
  ExecDetectResult,
  ExecIntegration,
} from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";

const run = promisify(execFile);

/** True if a process with `pid` currently exists AND looks like ours.
 *  `process.kill(pid, 0)` is a zero-signal query: it returns if the pid is
 *  live. We only trust it on success — ESRCH (no such pid) or EPERM (pid is
 *  another user's process) both mean the record is stale/unrelated. */
function pidAlive(pid: number | undefined | null): boolean {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // EPERM = process exists but is owned by another user (still alive).
    return false;
  }
}

/** True if a TCP connection to `host:port` can be opened within `timeoutMs`.
 *  Used to reject stale daemon records that point at unbound ports. */
function canConnect(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Raw connection shape from `coreTools.connections.list`; we map it to the
 *  renderer-facing ExecConnection (dropping the numeric-string sentinels). */
interface RawConnection {
  owner: "org" | "user";
  name: string;
  integration: string;
  provider: string;
  identityLabel?: string | null;
  description?: string | null;
  expiresAt: number | string | null;
  oauthClient: string | null;
}

/**
 * Drives the bundled Executor CLI (`executor call …`) from the main process.
 *
 * Executor is the local-first connections backbone: a local daemon owns the
 * `~/.executor` data store and holds every credential. peach-pi never sees a
 * secret — it lists the catalogue + connections and triggers add/remove, and
 * adding a connection hands the user off to Executor's local web UI to enter
 * the credential. Every CLI call returns `{ ok, data }`.
 */
export class ExecutorService {
  constructor(
    private binPath: string,
    private emit: Emit,
  ) {}

  private async call<T>(path: string[], input: unknown = {}): Promise<T> {
    const args = ["call", "executor", ...path, JSON.stringify(input)];
    const { stdout } = await run(this.binPath, args, { maxBuffer: 16 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { ok: boolean; data?: T; error?: unknown };
    if (!parsed.ok) {
      throw new Error(`executor ${path.join(" ")} failed: ${JSON.stringify(parsed.error ?? parsed)}`);
    }
    return parsed.data as T;
  }

  async integrations(): Promise<ExecIntegration[]> {
    const d = await this.call<{ integrations: ExecIntegration[] }>([
      "coreTools",
      "integrations",
      "list",
    ]);
    return d.integrations;
  }

  async connections(): Promise<ExecConnection[]> {
    const d = await this.call<{ connections: RawConnection[] }>([
      "coreTools",
      "connections",
      "list",
    ]);
    return d.connections.map((c) => ({
      owner: c.owner,
      name: c.name,
      integration: c.integration,
      provider: c.provider,
      identityLabel: c.identityLabel ?? null,
      description: c.description ?? null,
      expiresAt: typeof c.expiresAt === "number" ? c.expiresAt : null,
      isOAuth: c.oauthClient != null,
    }));
  }

  /** Returns the local web-UI Add-account URL (pre-authenticated); the IPC
   *  handler opens it. The user enters the credential there, so no secret
   *  passes through peach-pi. */
  async addConnection(integration: string): Promise<{ url: string; instructions: string }> {
    const r = await this.call<{ url: string; instructions: string }>(
      ["coreTools", "connections", "createHandoff"],
      { integration },
    );
    return { ...r, url: this.signUrl(r.url) };
  }

  /** Append the daemon's stable bearer token as `?_token=` so the browser opens
   *  the Executor web UI already signed in (matching `executor open`). Without
   *  this the page loads but its API calls 401 → "Authentication required". */
  private signUrl(url: string): string {
    const token = this.authToken();
    if (!token) return url;
    const u = new URL(url);
    u.searchParams.set("_token", token);
    return u.toString();
  }

  /** Reads the stable web token from `~/.executor/server-control/auth.json`
   *  (honoring `EXECUTOR_DATA_DIR`). */
  private authToken(): string | null {
    try {
      const dataDir = resolve(process.env.EXECUTOR_DATA_DIR ?? join(homedir(), ".executor"));
      const raw = readFileSync(join(dataDir, "server-control", "auth.json"), "utf8");
      const parsed = JSON.parse(raw) as { token?: string };
      return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : null;
    } catch {
      return null;
    }
  }

  /** Reads Executor's full discovery registry from its on-disk cache
   *  (~/.executor/cache/integrations.json). Browse/search only — many rows are
   *  docs links without a resolvable spec. Cached in memory after first read. */
  private catalogueCache: ExecCatalogueItem[] | null = null;
  async catalogue(): Promise<ExecCatalogueItem[]> {
    if (this.catalogueCache) return this.catalogueCache;
    try {
      const dataDir = resolve(process.env.EXECUTOR_DATA_DIR ?? join(homedir(), ".executor"));
      const raw = readFileSync(join(dataDir, "cache", "integrations.json"), "utf8");
      const items = JSON.parse(raw) as Array<{
        slug: string;
        name: string;
        description?: string;
        kind: string;
        domain?: string;
        url?: string;
        popularity?: number;
      }>;
      this.catalogueCache = items
        .filter((i) => i.kind === "openapi" || i.kind === "mcp" || i.kind === "graphql")
        .map((i) => ({
          slug: i.slug,
          name: i.name,
          description: i.description ?? "",
          kind: i.kind,
          domain: i.domain,
          url: i.url,
          popularity: i.popularity ?? 0,
        }))
        .sort((a, b) => b.popularity - a.popularity);
    } catch {
      this.catalogueCache = [];
    }
    return this.catalogueCache;
  }

  /** Auto-detect the integration kind behind a URL (the paste-a-URL flow). */
  async detect(url: string): Promise<ExecDetectResult[]> {
    const d = await this.call<{ results: ExecDetectResult[] }>(
      ["coreTools", "integrations", "detect"],
      { url },
    );
    return d.results;
  }

  /** Build the signed Executor web-UI "add integration" URL for a plugin. The
   *  IPC handler opens it; Executor resolves the spec/endpoint and the user
   *  enters the credential there. */
  async buildAddUrl(
    pluginKey: string,
    opts: { preset?: string; url?: string; namespace?: string },
  ): Promise<string> {
    const u = new URL(`/integrations/add/${pluginKey}`, await this.daemonOrigin());
    if (opts.preset) u.searchParams.set("preset", opts.preset);
    if (opts.url) u.searchParams.set("url", opts.url);
    if (opts.namespace) u.searchParams.set("namespace", opts.namespace);
    return this.signUrl(u.toString());
  }

  /** Origin of the running daemon (the web UI is served there). Reads the
   *  most recent `daemon-active-*.json` record from the Executor data dir but
   *  never trusts it blindly: the record's pid must be alive AND the recorded
   *  host:port must accept a TCP connection. A stale record (dead daemon that
   *  exited without cleaning up) is deleted and we fall back to the default
   *  port; if nothing is reachable we throw so the caller shows a real error
   *  instead of opening a blank `localhost` page. */
  private async daemonOrigin(): Promise<string> {
    const defaultOrigin = "http://localhost:4788";
    const dataDir = resolve(process.env.EXECUTOR_DATA_DIR ?? join(homedir(), ".executor"));

    let files: string[] = [];
    try {
      files = readdirSync(dataDir)
        .filter((f) => f.startsWith("daemon-active-") && f.endsWith(".json"))
        .map((f) => join(dataDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    } catch {
      /* data dir missing — skip straight to the default */
    }

    for (const file of files) {
      try {
        const r = JSON.parse(readFileSync(file, "utf8")) as {
          hostname?: string;
          port?: number;
          pid?: number;
        };
        const hostname = typeof r.hostname === "string" ? r.hostname : null;
        const port = typeof r.port === "number" ? r.port : null;
        if (!hostname || !port) {
          rmSync(file, { force: true });
          continue;
        }
        const origin = `http://${hostname}:${port}`;
        if (pidAlive(r.pid) && (await canConnect(hostname, port))) {
          return origin;
        }
        // Record points at a dead/unreachable daemon — it's stale, drop it.
        rmSync(file, { force: true });
      } catch {
        rmSync(file, { force: true });
      }
    }

    // No usable record; verify the default port instead of trusting it blindly.
    if (await canConnect("localhost", 4788)) return defaultOrigin;

    throw new Error(
      "Executor daemon is not running. Start peach-pi's desktop app (it runs the " +
        "daemon on localhost:4788), or run `executor daemon run --port 4788 --hostname localhost --foreground`.",
    );
  }

  async removeConnection(owner: "org" | "user", integration: string, name: string): Promise<void> {
    await this.call(["coreTools", "connections", "remove"], { owner, integration, name });
    this.emit("event:executorChanged", undefined);
  }

  async addOpenApi(url: string, slug: string): Promise<{ slug: string; toolCount: number }> {
    const d = await this.call<{ slug: string; toolCount: number | string }>(["openapi", "addSpec"], {
      spec: { kind: "url", url },
      slug,
    });
    this.emit("event:executorChanged", undefined);
    return { slug: d.slug, toolCount: typeof d.toolCount === "number" ? d.toolCount : 0 };
  }
}
