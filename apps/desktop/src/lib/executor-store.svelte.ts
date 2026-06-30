import {
  EXECUTOR_PRESETS,
  type ExecCatalogueItem,
  type ExecConnection,
  type ExecIntegration,
} from "@peach-pi/shared-types";
import { api } from "./ipc";

const ACRONYMS: Record<string, string> = {
  mcp: "MCP",
  api: "API",
  cli: "CLI",
  graphql: "GraphQL",
  ai: "AI",
  sdk: "SDK",
  url: "URL",
};

/** Favicon via Google's service (CSP-allowed), keyed by brand domain. */
export function execFaviconUrl(domain: string | undefined): string | null {
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
}

/** Executor integrations carry no display name — only a slug and a (sometimes
 *  paragraph-length) description. Mirror Executor's own UI by deriving a short
 *  label from the slug: "exa_search_api" → "Exa Search API". */
export function execDisplayName(slug: string): string {
  return slug
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Shared Executor connections state. Owned here so the sidebar (ConnectorsView)
 *  and the detail pane (ExecutorConnections) render from one source of truth. */
class ExecutorStore {
  integrations = $state<ExecIntegration[]>([]);
  connections = $state<ExecConnection[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  /** Slug of the integration shown in the detail pane. */
  selectedSlug = $state<string | null>(null);
  /** Whether the Connect dialog is open (rendered by ExecutorConnections, but
   *  also openable from the sidebar "+"). */
  connectOpen = $state(false);
  /** Full discovery registry (~3.5k rows), lazy-loaded once. Also powers
   *  sidebar favicons via slug→domain lookup. */
  catalogue = $state<ExecCatalogueItem[]>([]);
  #catalogueLoaded = false;

  /** Connections grouped by integration slug. */
  byIntegration = $derived.by(() => {
    const m = new Map<string, ExecConnection[]>();
    for (const c of this.connections) {
      const list = m.get(c.integration) ?? [];
      list.push(c);
      m.set(c.integration, list);
    }
    return m;
  });

  get selected(): ExecIntegration | null {
    return this.integrations.find((i) => i.slug === this.selectedSlug) ?? null;
  }

  /** slug / kind:slug → domain, from the registry. */
  #domainMap = $derived.by(() => {
    const m = new Map<string, string>();
    // Curated presets first (cover services missing from the registry, e.g.
    // Firecrawl); registry rows then fill in the long tail.
    for (const p of EXECUTOR_PRESETS) {
      if (!p.domain) continue;
      if (!m.has(p.id)) m.set(p.id, p.domain);
      m.set(`${p.pluginKey}:${p.id}`, p.domain);
    }
    for (const i of this.catalogue) {
      if (!i.domain) continue;
      if (!m.has(i.slug)) m.set(i.slug, i.domain);
      if (!m.has(`${i.kind}:${i.slug}`)) m.set(`${i.kind}:${i.slug}`, i.domain);
    }
    return m;
  });

  /** Best-effort brand domain for an installed integration. Installed slugs are
   *  suffixed by kind ("notion_mcp", "exa_search_api"); the registry keys are
   *  the bare service ("notion", "exa"), so we strip the suffix and try a few
   *  candidates, preferring a same-kind match. */
  domainFor(slug: string, kind: string): string | undefined {
    const m = this.#domainMap;
    let base = slug;
    for (const s of ["_mcp", "_api", "_openapi", "_graphql", "_oauth"]) {
      if (base.endsWith(s)) {
        base = base.slice(0, -s.length);
        break;
      }
    }
    const candidates = [
      slug,
      base,
      base.replace(/_/g, "-"),
      slug.replace(/_/g, "-"),
      base.split("_")[0],
    ];
    for (const c of candidates) {
      if (!c) continue;
      const hit = m.get(`${kind}:${c}`) ?? m.get(c);
      if (hit) return hit;
    }
    return undefined;
  }

  async loadCatalogue() {
    if (this.#catalogueLoaded) return;
    this.#catalogueLoaded = true;
    try {
      this.catalogue = await api.invoke("executor:catalogue");
    } catch {
      /* registry cache may be absent; favicons/browse fall back gracefully */
    }
  }

  async load() {
    this.error = null;
    try {
      const [ints, conns] = await Promise.all([
        api.invoke("executor:integrations"),
        api.invoke("executor:connections"),
      ]);
      this.integrations = ints;
      this.connections = conns;
      if (!this.selectedSlug || !ints.some((i) => i.slug === this.selectedSlug)) {
        this.selectedSlug = ints[0]?.slug ?? null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
}

export const executorStore = new ExecutorStore();
