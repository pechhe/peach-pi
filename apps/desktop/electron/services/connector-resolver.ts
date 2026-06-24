import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ConnectorService } from "./connector-service.ts";
import type { CustomConnectionService } from "./custom-connection-service.ts";
import type { BwsService } from "./bws-service.ts";

/**
 * Localhost-only HTTP bridge that lets a pi extension (running in the terminal,
 * with no access to Electron IPC) reach Composio through the main process. The
 * Composio API key stays in the main process — the extension only sees tool
 * schemas and execution results.
 *
 * Auth: a random bearer token, written (with the random port) to a non-secret
 * bootstrap file at `~/.pi/agent/peach-connectors.json` that the extension
 * reads to find us. A low-value local secret that keeps casual port-scans out.
 *
 * Surface:
 *   GET  /health                          → { ok: true }
 *   GET  /tools?search=&toolkits=a,b       → Composio tool schemas (discovery)
 *   POST /execute  { toolSlug, arguments } → execute a tool in the Composio cloud
 *   GET  /custom-connections               → saved custom connections (names+URLs)
 *   POST /custom-request { connection, method, path, body, headers }
 *                                          → authenticated HTTP call via a saved key
 *   GET  /secrets?projectId=               → BWS secrets (names+ids; values redacted)
 *   POST /secret-get { secretId }          → one BWS secret including cleartext value
 */
const BOOTSTRAP_DIR = join(homedir(), ".pi", "agent");
const BOOTSTRAP_PATH = join(BOOTSTRAP_DIR, "peach-connectors.json");

export class ConnectorResolver {
  private server: Server | null = null;
  private baseUrl = "";
  private readonly token = randomBytes(32).toString("hex");

  constructor(
    private service: ConnectorService,
    private custom: CustomConnectionService,
    private bws: BwsService,
  ) {}

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

      if (req.method === "GET" && url.pathname === "/tools") {
        const search = url.searchParams.get("search") ?? "";
        const toolkitsParam = url.searchParams.get("toolkits") ?? "";
        const toolkits = toolkitsParam ? toolkitsParam.split(",").filter(Boolean) : undefined;
        const tools = await this.service.searchTools(search, toolkits);
        return this.send(res, 200, { tools });
      }

      if (req.method === "POST" && url.pathname === "/execute") {
        const body = (await this.readJson(req)) as {
          toolSlug?: string;
          arguments?: Record<string, unknown>;
        };
        if (!body.toolSlug) return this.send(res, 400, { error: "toolSlug required" });
        const result = await this.service.executeTool(body.toolSlug, body.arguments ?? {});
        return this.send(res, 200, { result });
      }

      if (req.method === "GET" && url.pathname === "/custom-connections") {
        return this.send(res, 200, { connections: await this.custom.listForAgent() });
      }

      if (req.method === "POST" && url.pathname === "/custom-request") {
        const body = (await this.readJson(req)) as {
          connection?: string;
          method?: string;
          path?: string;
          body?: unknown;
          headers?: Record<string, string>;
        };
        if (!body.connection) return this.send(res, 400, { error: "connection required" });
        const result = await this.custom.request(
          body.connection,
          body.method ?? "GET",
          body.path ?? "/",
          body.body,
          body.headers,
        );
        return this.send(res, 200, result);
      }

      // BWS secrets. /secrets returns names + ids only (never values) so the
      // model can discover what's available; /secret-get returns the cleartext
      // value on demand so it never lands in the prompt text.
      if (req.method === "GET" && url.pathname === "/secrets") {
        const status = await this.bws.status();
        if (!status.authenticated) {
          return this.send(res, 409, { error: "BWS not authenticated", status });
        }
        const projectId = url.searchParams.get("projectId") ?? status.projectId;
        const secrets = await this.bws.listSecrets(projectId);
        return this.send(
          res,
          200,
          secrets.map((s) => ({ id: s.id, key: s.key, projectId: s.projectId })),
        );
      }

      if (req.method === "POST" && url.pathname === "/secret-get") {
        const body = (await this.readJson(req)) as { secretId?: string };
        if (!body.secretId) return this.send(res, 400, { error: "secretId required" });
        const secret = await this.bws.getSecret(body.secretId);
        return this.send(res, 200, secret);
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
