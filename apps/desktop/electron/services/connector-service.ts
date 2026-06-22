import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { AuthScheme, Composio } from "@composio/core";
import type {
  Connection,
  ConnectionStatus,
  ConnectStartResult,
  ToolkitCatalogEntry,
} from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";

/** Where the Composio API key lives — kept out of the repo and the renderer.
 *  `{ "composio": { "apiKey": "ak_…" } }` */
const CLIENTS_FILE = join(homedir(), ".pi", "agent", "peach-connectors-clients.json");

/** Single-user desktop app → one fixed Composio user scope. */
const USER_ID = "peach-pi-local";

function readApiKey(): string | null {
  try {
    const raw = JSON.parse(readFileSync(CLIENTS_FILE, "utf8")) as {
      composio?: { apiKey?: string };
    };
    return raw.composio?.apiKey ?? null;
  } catch {
    return null;
  }
}

function titleCase(slug: string): string {
  return slug
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Map Composio's connection status onto our renderer-facing union. */
function toStatus(s: string): ConnectionStatus {
  switch (s) {
    case "ACTIVE":
    case "INITIATED":
    case "EXPIRED":
    case "FAILED":
    case "INACTIVE":
      return s;
    case "INITIALIZING":
      return "INITIATED";
    case "REVOKED":
      return "EXPIRED";
    default:
      return "FAILED";
  }
}

function primaryScheme(t: {
  authSchemes?: string[];
  composioManagedAuthSchemes?: string[];
  noAuth?: boolean;
}): string {
  if (t.noAuth) return "NO_AUTH";
  return t.composioManagedAuthSchemes?.[0] ?? t.authSchemes?.[0] ?? "OAUTH2";
}

/**
 * Thin wrapper over the Composio cloud. Composio owns provider auth + token
 * storage + tool execution; peach-pi only proxies catalogue / connect / list /
 * execute, holding the API key in the main process so it never reaches the
 * renderer or the agent. The agent-facing methods (`searchTools`,
 * `executeTool`) are surfaced over the localhost ConnectorResolver.
 */
export class ConnectorService {
  private composio: Composio | null = null;
  /** toolkitSlug → Composio auth-config id (lazily created, cached). */
  private authConfigCache = new Map<string, string>();
  /** toolkitSlug → display meta, populated from catalogue fetches so `list`
   *  can label connections without a round-trip per slug. */
  private meta = new Map<string, { name: string; logo: string | null }>();

  constructor(private emit: Emit) {}

  private client(): Composio {
    if (this.composio) return this.composio;
    const apiKey = readApiKey();
    if (!apiKey) {
      throw new Error(
        'No Composio API key. Add { "composio": { "apiKey": "ak_…" } } to ' +
          "~/.pi/agent/peach-connectors-clients.json.",
      );
    }
    this.composio = new Composio({ apiKey });
    return this.composio;
  }

  /** Search the toolkit catalogue. The list endpoint has no text search, so we
   *  fetch a usage-ranked page and filter client-side. Empty query → top page. */
  async catalogue(query: string): Promise<ToolkitCatalogEntry[]> {
    const c = this.client();
    const page = await c.toolkits.get({ sortBy: "usage", limit: 100 });
    const connected = new Set(
      (await this.list()).filter((x) => x.status === "ACTIVE").map((x) => x.toolkitSlug),
    );
    const q = query.trim().toLowerCase();
    const out: ToolkitCatalogEntry[] = [];
    for (const t of page) {
      this.meta.set(t.slug, { name: t.name, logo: t.meta?.logo ?? null });
      if (q && !t.slug.toLowerCase().includes(q) && !t.name.toLowerCase().includes(q)) continue;
      out.push({
        slug: t.slug,
        name: t.name,
        description: t.meta?.description ?? "",
        logoUrl: t.meta?.logo ?? null,
        authScheme: primaryScheme(t),
        connected: connected.has(t.slug),
      });
    }
    return out;
  }

  async list(): Promise<Connection[]> {
    const c = this.client();
    const res = await c.connectedAccounts.list({ userIds: [USER_ID] });
    return res.items.map((a) => {
      const m = this.meta.get(a.toolkit.slug);
      return {
        id: a.id,
        toolkitSlug: a.toolkit.slug,
        name: m?.name ?? titleCase(a.toolkit.slug),
        logoUrl: m?.logo ?? null,
        status: toStatus(a.status),
        createdAt: a.createdAt,
      };
    });
  }

  /** Begin an OAuth connect. Returns the Composio-hosted authorize URL; the
   *  IPC handler opens it via shell.openExternal. Completion is polled in the
   *  background and announced via event:connectorsChanged. */
  async connect(slug: string): Promise<ConnectStartResult> {
    const c = this.client();
    const authConfigId = await this.authConfigFor(slug);
    const req = await c.connectedAccounts.link(USER_ID, authConfigId);
    if (req.redirectUrl) this.pollUntilConnected(req.id);
    return { redirectUrl: req.redirectUrl ?? null, connectionRequestId: req.id };
  }

  /** Connect a non-redirect (API-key / token) toolkit. Completes synchronously. */
  async connectApiKey(slug: string, apiKey: string): Promise<Connection> {
    const c = this.client();
    const authConfigId = await this.authConfigFor(slug);
    const req = await c.connectedAccounts.initiate(USER_ID, authConfigId, {
      config: AuthScheme.APIKey({ api_key: apiKey }),
    });
    const acct = await req.waitForConnection();
    this.emit("event:connectorsChanged", undefined);
    const m = this.meta.get(slug);
    return {
      id: acct.id,
      toolkitSlug: slug,
      name: m?.name ?? titleCase(slug),
      logoUrl: m?.logo ?? null,
      status: toStatus(acct.status),
      createdAt: acct.createdAt,
    };
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.client().connectedAccounts.delete(connectionId);
    this.emit("event:connectorsChanged", undefined);
  }

  // ── agent-facing (proxied over the localhost ConnectorResolver) ────────────

  /** Discover Composio tools for the agent (provider-wrapped slugs + schemas). */
  async searchTools(query: string, toolkits?: string[]): Promise<unknown> {
    const c = this.client();
    if (toolkits?.length) {
      return c.tools.get(USER_ID, { toolkits, limit: 20, search: query || undefined });
    }
    return c.tools.get(USER_ID, { search: query });
  }

  /** Execute a Composio tool for the agent (runs in the Composio cloud). */
  async executeTool(slug: string, args: Record<string, unknown>): Promise<unknown> {
    return this.client().tools.execute(slug, { userId: USER_ID, arguments: args });
  }

  /** Resolve (or lazily create) a Composio-managed auth config for a toolkit. */
  private async authConfigFor(slug: string): Promise<string> {
    const cached = this.authConfigCache.get(slug);
    if (cached) return cached;
    const c = this.client();
    const existing = await c.authConfigs.list({ toolkit: slug });
    const id =
      existing.items[0]?.id ??
      (await c.authConfigs.create(slug, { type: "use_composio_managed_auth" })).id;
    this.authConfigCache.set(slug, id);
    return id;
  }

  private pollUntilConnected(connectionRequestId: string): void {
    void this.client()
      .connectedAccounts.waitForConnection(connectionRequestId)
      .then(() => this.emit("event:connectorsChanged", undefined))
      .catch(() => {
        // INITIATED expires after ~10m, or the user denied consent. Either way
        // a refresh lets the renderer reflect the terminal state.
        this.emit("event:connectorsChanged", undefined);
      });
  }
}
