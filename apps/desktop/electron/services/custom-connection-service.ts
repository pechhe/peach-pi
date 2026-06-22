import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { CustomConnection, CustomConnectionInput } from "@peach-pi/shared-types";

/**
 * Local store of user-defined HTTP credentials (name + base URL + API key),
 * independent of Composio. Persisted as plaintext JSON on-device — local-first,
 * single-user — and exposed to the agent through the ConnectorResolver as the
 * `custom_request` tool. The raw key is never returned to the renderer.
 */
const STORE_DIR = join(homedir(), ".pi", "agent");
const STORE_PATH = join(STORE_DIR, "peach-custom-connections.json");

interface StoredConnection extends CustomConnection {
  apiKey: string;
}

const mask = (key: string): string =>
  "••••" + (key.length > 4 ? key.slice(-4) : "");

export class CustomConnectionService {
  // Reuse the same change event the renderer already listens to.
  constructor(private emit: (channel: "event:connectorsChanged", payload: undefined) => void) {}

  private async read(): Promise<StoredConnection[]> {
    try {
      const raw = JSON.parse(await readFile(STORE_PATH, "utf8"));
      return Array.isArray(raw?.connections) ? (raw.connections as StoredConnection[]) : [];
    } catch {
      return [];
    }
  }

  private async write(connections: StoredConnection[]): Promise<void> {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify({ connections }, null, 2), "utf8");
  }

  private static toPublic(c: StoredConnection): CustomConnection {
    return {
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      headerName: c.headerName,
      headerPrefix: c.headerPrefix,
      keyPreview: c.keyPreview,
      createdAt: c.createdAt,
    };
  }

  /** Renderer-facing: never includes the raw key. */
  async list(): Promise<CustomConnection[]> {
    return (await this.read()).map(CustomConnectionService.toPublic);
  }

  async create(input: CustomConnectionInput): Promise<CustomConnection> {
    const name = input.name.trim();
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
    const apiKey = input.apiKey.trim();
    if (!name || !baseUrl || !apiKey) throw new Error("name, baseUrl and apiKey are required");
    const conns = await this.read();
    if (conns.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A custom connection named "${name}" already exists`);
    }
    const stored: StoredConnection = {
      id: randomUUID(),
      name,
      baseUrl,
      headerName: (input.headerName ?? "Authorization").trim() || "Authorization",
      headerPrefix: input.headerPrefix ?? "Bearer ",
      keyPreview: mask(apiKey),
      createdAt: new Date().toISOString(),
      apiKey,
    };
    await this.write([...conns, stored]);
    this.emit("event:connectorsChanged", undefined);
    return CustomConnectionService.toPublic(stored);
  }

  async delete(id: string): Promise<void> {
    const conns = await this.read();
    await this.write(conns.filter((c) => c.id !== id));
    this.emit("event:connectorsChanged", undefined);
  }

  // ── agent-facing (proxied over the localhost ConnectorResolver) ────────────

  /** Names + base URLs the agent can target (no keys). */
  async listForAgent(): Promise<{ name: string; baseUrl: string }[]> {
    return (await this.read()).map((c) => ({ name: c.name, baseUrl: c.baseUrl }));
  }

  /** Make an authenticated HTTP request against a saved connection. */
  async request(
    connection: string,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; body: string }> {
    const conn = (await this.read()).find((c) => c.name === connection);
    if (!conn) throw new Error(`No custom connection named "${connection}"`);
    const m = (method || "GET").toUpperCase();
    const url = conn.baseUrl + (path.startsWith("/") ? path : "/" + path);
    const headers: Record<string, string> = { ...extraHeaders };
    headers[conn.headerName] = conn.headerPrefix + conn.apiKey;
    const hasBody = body != null && m !== "GET" && m !== "HEAD";
    if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
    const res = await fetch(url, {
      method: m,
      headers,
      body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });
    return { status: res.status, body: await res.text() };
  }
}
