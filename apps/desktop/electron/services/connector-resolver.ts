import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ConnectorService } from "./connector-service.ts";
import { OAUTH_PRESETS } from "./connector-catalog.ts";

/**
 * Localhost-only HTTP bridge that lets a pi extension (running in the terminal,
 * with no access to Electron IPC) read connector credentials out of the main
 * process. Secrets never touch disk: OAuth tokens live encrypted in Keychain
 * via `SecretStore` and are handed out live over this loopback socket.
 *
 * Auth: a random bearer token, written (with the random port) to a non-secret
 * bootstrap file at `~/.pi/agent/peach-connectors.json` that the extension reads
 * to find us. That token is a low-value local secret — any process that can
 * read the user's home dir already has broad access — but it keeps casual
 * port-scans from grabbing tokens.
 *
 * Surface:
 *   GET /health                       → { ok: true }
 *   GET /connectors                   → [{ provider, label, authKind, connected, apiBaseUrl }]
 *   GET /connectors/:provider/credentials → { provider, apiBaseUrl, headers, expiresAt }
 */
const BOOTSTRAP_DIR = join(homedir(), ".pi", "agent");
const BOOTSTRAP_PATH = join(BOOTSTRAP_DIR, "peach-connectors.json");

// Provider → REST base, for URL building on the extension side. Custom
// connectors without a preset have no known base (null).
const API_BASES = new Map(OAUTH_PRESETS.map((p) => [p.provider, p.apiBaseUrl ?? null]));

interface ResolverMeta {
  provider: string;
  label: string;
  authKind: string;
  connected: boolean;
  apiBaseUrl: string | null;
}

export class ConnectorResolver {
  private server: Server | null = null;
  private baseUrl = "";
  private readonly token = randomBytes(32).toString("hex");

  constructor(private service: ConnectorService) {}

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
      if (req.method !== "GET") return this.send(res, 405, { error: "method not allowed" });

      if (url.pathname === "/health") return this.send(res, 200, { ok: true });

      if (url.pathname === "/connectors") {
        const rows = this.service.list().map<ResolverMeta>((c) => ({
          provider: c.provider,
          label: c.label,
          authKind: c.authKind,
          connected: c.connected,
          apiBaseUrl: API_BASES.get(c.provider) ?? null,
        }));
        return this.send(res, 200, { connectors: rows });
      }

      const m = /^\/connectors\/([^/]+)\/credentials$/.exec(url.pathname);
      if (m) {
        const provider = m[1] ? decodeURIComponent(m[1]) : "";
        const resolved = await this.service.resolve(provider);
        if (!resolved) return this.send(res, 404, { error: `no connector for ${provider}` });
        return this.send(res, 200, {
          provider,
          apiBaseUrl: API_BASES.get(provider) ?? null,
          headers: resolved.headers,
          expiresAt: resolved.expiresAt,
        });
      }

      return this.send(res, 404, { error: "not found" });
    } catch (err) {
      return this.send(res, 500, { error: String(err) });
    }
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
