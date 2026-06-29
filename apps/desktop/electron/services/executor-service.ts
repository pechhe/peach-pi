import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ExecConnection, ExecIntegration } from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";

const run = promisify(execFile);

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
