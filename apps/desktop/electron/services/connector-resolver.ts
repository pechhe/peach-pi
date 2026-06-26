import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ConnectorService } from "./connector-service.ts";
import type { CustomConnectionService } from "./custom-connection-service.ts";
import type { BwsService } from "./bws-service.ts";
import { ConnectorToolRoutes, type ConnectorToolName } from "@peach-pi/shared-types";

/**
 * Localhost-only HTTP bridge that lets a pi extension (running in the terminal,
 * with no access to Electron IPC) reach Composio / custom HTTP connections /
 * Bitwarden Secrets Manager through the main process. Secrets stay in the main
 * process — the extension only sees tool schemas and execution results.
 *
 * Auth: a random bearer token, written (with the random port) to a non-secret
 * bootstrap file at `~/.pi/agent/peach-connectors.json` that the extension
 * reads to find us. A low-value local secret that keeps casual port-scans out.
 *
 * The tool route surface is derived from `ConnectorToolRoutes` (the typed
 * tools contract in `@peach-pi/shared-types`), so the route table and the
 * `peach-connectors` extension share one source of truth. A tool registered on
 * one side but not the other is a compile error against the contract.
 *   GET  /health  → { ok: true }   (non-tool liveness probe)
 */
const BOOTSTRAP_DIR = join(homedir(), ".pi", "agent");
const BOOTSTRAP_PATH = join(BOOTSTRAP_DIR, "peach-connectors.json");

type RouteHandler = (req: IncomingMessage, url: URL) => Promise<unknown>;

interface RouteEntry {
  method: string;
  path: string;
  handle: RouteHandler;
}

export class ConnectorResolver {
  private server: Server | null = null;
  private baseUrl = "";
  private readonly token = randomBytes(32).toString("hex");

  /** Route table derived from ConnectorToolRoutes (single source of truth). */
  private readonly routes: Record<ConnectorToolName, RouteEntry>;

  constructor(
    service: ConnectorService,
    custom: CustomConnectionService,
    bws: BwsService,
  ) {
    this.routes = {
      connectors_search_tools: {
        ...ConnectorToolRoutes.connectors_search_tools,
        handle: async (_req, url) => {
          const search = url.searchParams.get("search") ?? "";
          const toolkitsParam = url.searchParams.get("toolkits") ?? "";
          const toolkits = toolkitsParam
            ? toolkitsParam.split(",").filter(Boolean)
            : undefined;
          const tools = await service.searchTools(search, toolkits);
          return { tools };
        },
      },
      connector_execute: {
        ...ConnectorToolRoutes.connector_execute,
        handle: async (req) => {
          const body = (await this.readJson(req)) as {
            toolSlug?: string;
            arguments?: Record<string, unknown>;
          };
          if (!body.toolSlug) return { __status: 400, __body: { error: "toolSlug required" } };
          const result = await service.executeTool(body.toolSlug, body.arguments ?? {});
          return { result };
        },
      },
      custom_connections: {
        ...ConnectorToolRoutes.custom_connections,
        handle: async () => ({ connections: await custom.listForAgent() }),
      },
      custom_request: {
        ...ConnectorToolRoutes.custom_request,
        handle: async (req) => {
          const body = (await this.readJson(req)) as {
            connection?: string;
            method?: string;
            path?: string;
            body?: unknown;
            headers?: Record<string, string>;
          };
          if (!body.connection) return { __status: 400, __body: { error: "connection required" } };
          return custom.request(
            body.connection,
            body.method ?? "GET",
            body.path ?? "/",
            body.body,
            body.headers,
          );
        },
      },
      bws_list_secrets: {
        ...ConnectorToolRoutes.bws_list_secrets,
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
        ...ConnectorToolRoutes.bws_get_secret,
        handle: async (req) => {
          const body = (await this.readJson(req)) as { secretId?: string };
          if (!body.secretId) return { __status: 400, __body: { error: "secretId required" } };
          return bws.getSecret(body.secretId);
        },
      },
    };
  }

  /** Registered route specs, derived from `ConnectorToolRoutes`. */
  get routeSpecs(): { name: ConnectorToolName; method: string; path: string }[] {
    return (Object.keys(this.routes) as ConnectorToolName[]).map((name) => ({
      name,
      method: this.routes[name].method,
      path: this.routes[name].path,
    }));
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
          // Handlers can signal a non-200 via { __status, __body }.
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
