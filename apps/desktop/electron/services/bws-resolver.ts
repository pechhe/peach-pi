import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SecretToolRoutes, type SecretToolName } from "@peach-pi/shared-types";

import type { BwsService } from "./bws-service.ts";

/**
 * Localhost-only HTTP bridge that lets the `peach-secrets` pi extension
 * (running in the terminal, with no access to Electron IPC) reach Bitwarden
 * Secrets Manager through the main process. Secret values stay in the main
 * process — the extension only sees names/ids and the fetched value as a tool
 * result.
 *
 * Auth: a random bearer token, written (with the random port) to a non-secret
 * bootstrap file at `~/.pi/agent/peach-secrets.json` that the extension reads
 * to find us. The route surface is derived from `SecretToolRoutes`, so the
 * route table and the extension share one source of truth.
 *   GET /health → { ok: true }   (non-tool liveness probe)
 */
const BOOTSTRAP_DIR = join(homedir(), ".pi", "agent");
const BOOTSTRAP_PATH = join(BOOTSTRAP_DIR, "peach-secrets.json");

type RouteHandler = (req: IncomingMessage, url: URL) => Promise<unknown>;

interface RouteEntry {
  method: string;
  path: string;
  handle: RouteHandler;
}

export class BwsResolver {
  private server: Server | null = null;
  private baseUrl = "";
  private readonly token = randomBytes(32).toString("hex");
  private readonly routes: Record<SecretToolName, RouteEntry>;

  constructor(bws: BwsService) {
    this.routes = {
      bws_list_secrets: {
        ...SecretToolRoutes.bws_list_secrets,
        handle: async (_req, url) => {
          const status = await bws.status();
          if (!status.authenticated) {
            return { __status: 409, __body: { error: "BWS not authenticated", status } };
          }
          const projectId = url.searchParams.get("projectId") ?? status.projectId;
          const secrets = await bws.listSecrets(projectId);
          return secrets.map((s) => ({ id: s.id, key: s.key, projectId: s.projectId }));
        },
      },
      bws_get_secret: {
        ...SecretToolRoutes.bws_get_secret,
        handle: async (req) => {
          const body = (await this.readJson(req)) as { secretId?: string };
          if (!body.secretId) return { __status: 400, __body: { error: "secretId required" } };
          return bws.getSecret(body.secretId);
        },
      },
    };
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        this.baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    this.server = null;
    await new Promise<void>((r) => s.close(() => r()));
  }

  /** Write the non-secret bootstrap pointer the extension reads to find us. */
  async writeBootstrap(): Promise<void> {
    await mkdir(BOOTSTRAP_DIR, { recursive: true });
    await writeFile(
      BOOTSTRAP_PATH,
      JSON.stringify({ baseUrl: this.baseUrl, token: this.token }, null, 2),
    );
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!this.checkAuth(req)) return this.send(res, 401, { error: "unauthorized" });
      const url = new URL(req.url ?? "/", this.baseUrl);

      if (req.method === "GET" && url.pathname === "/health") {
        return this.send(res, 200, { ok: true });
      }

      for (const entry of Object.values(this.routes)) {
        if (req.method === entry.method && url.pathname === entry.path) {
          const result = await entry.handle(req, url);
          if (
            result !== null &&
            typeof result === "object" &&
            "__status" in result &&
            "__body" in result
          ) {
            const r = result as { __status: number; __body: unknown };
            return this.send(res, r.__status, r.__body);
          }
          return this.send(res, 200, result);
        }
      }

      return this.send(res, 404, { error: "not found" });
    } catch (err) {
      return this.send(res, 500, { error: String(err) });
    }
  }

  private async readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  }

  private checkAuth(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? "";
    return header === `Bearer ${this.token}`;
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
