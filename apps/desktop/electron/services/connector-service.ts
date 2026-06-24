import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { AuthScheme, Composio } from "@composio/core";
import type { AuthSchemeType } from "@composio/core";
import type {
  AuthField,
  Connection,
  ConnectionStatus,
  ConnectStartResult,
  ToolkitCatalogEntry,
  ToolkitDetail,
} from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";
import { AsyncTtl, KeyedAsyncTtl } from "./ttl-cache.ts";

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

/** Composio field names that hold a secret (rendered as password inputs). */
const SECRET_FIELDS = new Set([
  "api_key",
  "generic_api_key",
  "bearer_token",
  "token",
  "password",
  "basic_encoded",
]);

/** Extract the manual-connect fields (base URL, API key, …) a non-OAuth
 *  toolkit asks for, from its Composio auth-config schema. */
function parseAuthFields(
  details: unknown,
  scheme: string,
): AuthField[] {
  if (!Array.isArray(details)) return [];
  // Prefer the config matching the primary scheme; else the first.
  const cfg =
    details.find((d) => (d as { mode?: string }).mode === scheme) ?? details[0];
  const init = (cfg as { fields?: { connectedAccountInitiation?: { required?: unknown[]; optional?: unknown[] } } })
    ?.fields?.connectedAccountInitiation;
  if (!init) return [];
  const map = (arr: unknown[] | undefined, required: boolean): AuthField[] =>
    (arr ?? []).map((f) => {
      const x = f as { name: string; displayName?: string; description?: string };
      return {
        name: x.name,
        label: x.displayName ?? x.name,
        description: x.description ?? "",
        required,
        secret: SECRET_FIELDS.has(x.name),
      };
    });
  return [...map(init.required, true), ...map(init.optional, false)];
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
  // Re-opening the Connectors page re-fires these cloud reads; cache them so
  // navigation is instant. Cleared on every connectorsChanged emit.
  private listCache = new AsyncTtl<Connection[]>(60_000);
  private catalogueCache = new KeyedAsyncTtl<ToolkitCatalogEntry[]>(60_000);

  constructor(private emit: Emit) {}

  /** Emit the renderer-facing change event, dropping any stale caches first so
   *  the reload it triggers re-fetches fresh. */
  private changed(): void {
    this.listCache.clear();
    this.catalogueCache.clear();
    this.emit("event:connectorsChanged", undefined);
  }

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
    return this.catalogueCache.run(query.trim().toLowerCase(), () => this.fetchCatalogue(query));
  }

  private async fetchCatalogue(query: string): Promise<ToolkitCatalogEntry[]> {
    const c = this.client();
    const page = await c.toolkits.get({ sortBy: "usage", limit: 100 });
    const counts = new Map<string, number>();
    for (const x of await this.list()) {
      if (x.status === "ACTIVE") counts.set(x.toolkitSlug, (counts.get(x.toolkitSlug) ?? 0) + 1);
    }
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
        connectedCount: counts.get(t.slug) ?? 0,
      });
    }
    return out;
  }

  /** Full detail for one toolkit: metadata + its tool list (for the detail
   *  pane). `readOnly` derives from Composio's readOnlyHint tag. */
  async toolkit(slug: string): Promise<ToolkitDetail> {
    const c = this.client();
    const tk = await c.toolkits.get(slug);
    const raw = await c.tools.getRawComposioTools({ toolkits: [slug], limit: 100 });
    this.meta.set(slug, { name: tk.name, logo: tk.meta?.logo ?? null });
    const scheme = primaryScheme(tk);
    return {
      slug: tk.slug,
      name: tk.name,
      description: tk.meta?.description ?? "",
      logoUrl: tk.meta?.logo ?? null,
      authScheme: scheme,
      categories: (tk.meta?.categories ?? []).map((x) => x.name),
      // OAuth connects via redirect (no manual form); only non-OAuth toolkits
      // collect credential fields.
      authFields: scheme.startsWith("OAUTH")
        ? []
        : parseAuthFields((tk as { authConfigDetails?: unknown }).authConfigDetails, scheme),
      tools: raw.map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description ?? "",
        readOnly: (t.tags ?? []).includes("readOnlyHint"),
      })),
    };
  }

  async list(): Promise<Connection[]> {
    return this.listCache.run(() => this.fetchList());
  }

  private async fetchList(): Promise<Connection[]> {
    const c = this.client();
    const res = await c.connectedAccounts.list({ userIds: [USER_ID] });
    // connectedAccounts only carry the toolkit slug, so the logo comes from
    // `meta`. Backfill any connected toolkit we haven't seen yet (e.g. not on
    // the catalogue's top page) so its icon isn't stuck on the monogram.
    await this.ensureMeta([...new Set(res.items.map((a) => a.toolkit.slug))]);
    return res.items.map((a) => {
      const m = this.meta.get(a.toolkit.slug);
      return {
        id: a.id,
        toolkitSlug: a.toolkit.slug,
        name: m?.name ?? titleCase(a.toolkit.slug),
        alias: a.alias ?? null,
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

  /** Connect a non-redirect toolkit with user-supplied credential fields
   *  (e.g. Metabase base URL + API key). The `fields` keys are the exact
   *  Composio field names from ToolkitDetail.authFields. Completes
   *  synchronously. */
  async connectFields(slug: string, fields: Record<string, string>): Promise<Connection> {
    const c = this.client();
    const authConfigId = await this.authConfigFor(slug);
    // BaseConnectionFields has a catch-all, so arbitrary field names (full,
    // subdomain, generic_api_key, …) pass through to Composio untouched.
    const config = AuthScheme.APIKey(fields as { generic_api_key?: string });
    const req = await c.connectedAccounts.initiate(USER_ID, authConfigId, { config });
    const acct = await req.waitForConnection();
    this.changed();
    const m = this.meta.get(slug);
    return {
      id: acct.id,
      toolkitSlug: slug,
      name: m?.name ?? titleCase(slug),
      alias: acct.alias ?? null,
      logoUrl: m?.logo ?? null,
      status: toStatus(acct.status),
      createdAt: acct.createdAt,
    };
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.client().connectedAccounts.delete(connectionId);
    this.changed();
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

  /** Populate `meta` (name + logo) for any slugs we don't already know, one
   *  toolkit fetch each (in parallel). Cached for the process lifetime. */
  private async ensureMeta(slugs: string[]): Promise<void> {
    const missing = slugs.filter((s) => !this.meta.has(s));
    if (missing.length === 0) return;
    const c = this.client();
    await Promise.all(
      missing.map(async (slug) => {
        try {
          const tk = await c.toolkits.get(slug);
          this.meta.set(slug, { name: tk.name, logo: tk.meta?.logo ?? null });
        } catch {
          // Leave unset — the renderer falls back to a monogram tile.
        }
      }),
    );
  }

  /** Resolve (or lazily create) a Composio-managed auth config for a toolkit.
   *  Composio doesn't manage OAuth creds for every toolkit (e.g. PostHog is
   *  API_KEY). For those, `use_composio_managed_auth` create 400s with
   *  "Default auth config not found"; fall back to a custom auth config whose
   *  scheme matches the toolkit's real one. The user then supplies credentials
   *  at Composio's hosted connect link (same redirect flow as OAuth). */
  private async authConfigFor(slug: string): Promise<string> {
    const cached = this.authConfigCache.get(slug);
    if (cached) return cached;
    const c = this.client();
    const existing = await c.authConfigs.list({ toolkit: slug });
    let id = existing.items[0]?.id;
    if (!id) {
      try {
        id = (await c.authConfigs.create(slug, { type: "use_composio_managed_auth" })).id;
      } catch {
        const tk = await c.toolkits.get(slug);
        const scheme = (tk.authConfigDetails?.[0]?.mode ?? "OAUTH2") as AuthSchemeType;
        id = (
          await c.authConfigs.create(slug, {
            type: "use_custom_auth",
            authScheme: scheme,
            credentials: {},
          })
        ).id;
      }
    }
    this.authConfigCache.set(slug, id);
    return id;
  }

  private pollUntilConnected(connectionRequestId: string): void {
    void this.client()
      .connectedAccounts.waitForConnection(connectionRequestId)
      .then(() => this.changed())
      .catch(() => {
        // INITIATED expires after ~10m, or the user denied consent. Either way
        // a refresh lets the renderer reflect the terminal state.
        this.changed();
      });
  }
}
