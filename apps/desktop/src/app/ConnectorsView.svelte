<script lang="ts">
  import { onMount } from "svelte";
  import type {
    Connection,
    ToolkitCatalogEntry,
    ToolkitDetail,
    ToolInfo,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import Search from "@lucide/svelte/icons/search";
  import ConnectorIcon from "./ConnectorIcon.svelte";

  // Master-detail over the Composio catalogue. Left: connectors grouped by
  // connection state. Right: the selected toolkit's metadata + tool list.
  // Composio owns auth + tokens; toolkits can hold multiple accounts.
  let connections = $state<Connection[]>([]);
  let catalogue = $state<ToolkitCatalogEntry[]>([]);
  let query = $state("");
  let error = $state("");

  let selectedSlug = $state<string | null>(null);
  let detail = $state<ToolkitDetail | null>(null);
  let detailLoading = $state(false);
  let busySlug = $state<string | null>(null);

  // Manual-connection form in the detail pane (non-OAuth toolkits, e.g.
  // Metabase base URL + API key). Driven by detail.authFields.
  let formOpen = $state(false);
  let fieldValues = $state<Record<string, string>>({});
  // A toolkit connects manually when Composio asks for credential fields.
  const isManual = $derived((detail?.authFields.length ?? 0) > 0);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Connected toolkits (deduped — one row per toolkit, even with N accounts).
  const connectedToolkits = $derived.by(() => {
    const bySlug = new Map<string, { slug: string; name: string; logoUrl: string | null; count: number }>();
    for (const c of connections) {
      const e = bySlug.get(c.toolkitSlug);
      if (e) e.count += 1;
      else bySlug.set(c.toolkitSlug, { slug: c.toolkitSlug, name: c.name, logoUrl: c.logoUrl, count: 1 });
    }
    const q = query.trim().toLowerCase();
    return [...bySlug.values()]
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.slug.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const notConnected = $derived(catalogue.filter((t) => t.connectedCount === 0));

  const accountsForSelected = $derived(
    selectedSlug ? connections.filter((c) => c.toolkitSlug === selectedSlug) : [],
  );

  const toolGroups = $derived.by(() => {
    const tools = detail?.tools ?? [];
    const read = tools.filter((t) => t.readOnly);
    const write = tools.filter((t) => !t.readOnly);
    const out: { label: string; tools: ToolInfo[] }[] = [];
    if (write.length) out.push({ label: "Write tools", tools: write });
    if (read.length) out.push({ label: "Read-only tools", tools: read });
    return out;
  });

  async function loadConnections() {
    connections = await api.invoke("connectors:list");
  }

  async function loadCatalogue() {
    error = "";
    try {
      catalogue = await api.invoke("connectors:catalogue", query.trim());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadCatalogue(), 250);
  }

  async function select(slug: string) {
    selectedSlug = slug;
    formOpen = false;
    fieldValues = {};
    detailLoading = true;
    error = "";
    try {
      detail = await api.invoke("connectors:toolkit", slug);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      detail = null;
    } finally {
      detailLoading = false;
    }
  }

  onMount(() => {
    void loadConnections();
    void loadCatalogue();
    return api.on("event:connectorsChanged", () => {
      void loadConnections();
      void loadCatalogue();
    });
  });

  async function connect() {
    if (!detail) return;
    error = "";
    if (isManual) {
      formOpen = !formOpen;
      if (formOpen) fieldValues = {};
      return;
    }
    busySlug = detail.slug;
    try {
      await api.invoke("connectors:connect", detail.slug);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busySlug = null;
    }
  }

  const formValid = $derived(
    !!detail &&
      detail.authFields.filter((f) => f.required).every((f) => (fieldValues[f.name] ?? "").trim()),
  );

  async function submitFields() {
    if (!detail || !formValid) return;
    const fields: Record<string, string> = {};
    for (const f of detail.authFields) {
      const v = (fieldValues[f.name] ?? "").trim();
      if (v) fields[f.name] = v;
    }
    busySlug = detail.slug;
    error = "";
    try {
      await api.invoke("connectors:connectFields", detail.slug, fields);
      formOpen = false;
      fieldValues = {};
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busySlug = null;
    }
  }

  async function disconnect(c: Connection) {
    error = "";
    try {
      await api.invoke("connectors:disconnect", c.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const STATUS_DOT: Record<Connection["status"], string> = {
    ACTIVE: "bg-emerald-500",
    INITIATED: "bg-amber-500",
    EXPIRED: "bg-red-500",
    FAILED: "bg-red-500",
    INACTIVE: "bg-fainter",
  };
  const STATUS_LABEL: Record<Connection["status"], string> = {
    ACTIVE: "Connected",
    INITIATED: "Awaiting authorization…",
    EXPIRED: "Expired — reconnect",
    FAILED: "Failed",
    INACTIVE: "Disabled",
  };
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const accountLabel = (c: Connection) => c.alias ?? `Added ${fmtDate(c.createdAt)} · #${c.id.slice(-4)}`;
</script>

<main class="flex h-full flex-1" data-testid="connections-view">
  <!-- ── Sidebar ─────────────────────────────────────────────── -->
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-bg">
    <header class="titlebar-drag flex h-12 shrink-0 items-center px-4">
      <h1 class="text-sm font-semibold text-fg">Connectors</h1>
    </header>
    <div class="px-3 pb-2">
      <div class="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:border-border-focus">
        <Search size={14} class="shrink-0 text-muted" />
        <input
          class="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fainter"
          placeholder="Search apps…"
          bind:value={query}
          oninput={onSearchInput}
          data-testid="connector-search"
        />
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      {#if connectedToolkits.length > 0}
        <p class="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fainter">Connected</p>
        {#each connectedToolkits as t (t.slug)}
          <button
            class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
            class:bg-surface={selectedSlug === t.slug}
            onclick={() => select(t.slug)}
            data-testid={`sidebar-${t.slug}`}
          >
            <ConnectorIcon logoUrl={t.logoUrl} label={t.name} size={20} />
            <span class="flex-1 truncate text-sm text-fg">{t.name}</span>
            {#if t.count > 1}
              <span class="rounded-full bg-bg px-1.5 text-[11px] text-muted">{t.count}</span>
            {/if}
          </button>
        {/each}
      {/if}

      <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">Not connected</p>
      {#each notConnected as t (t.slug)}
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
          class:bg-surface={selectedSlug === t.slug}
          onclick={() => select(t.slug)}
          data-testid={`sidebar-${t.slug}`}
        >
          <ConnectorIcon logoUrl={t.logoUrl} label={t.name} size={20} />
          <span class="flex-1 truncate text-sm text-muted">{t.name}</span>
        </button>
      {/each}
      {#if notConnected.length === 0 && connectedToolkits.length === 0}
        <p class="px-2 py-4 text-xs text-fainter">No matching apps.</p>
      {/if}
    </nav>
  </aside>

  <!-- ── Detail ──────────────────────────────────────────────── -->
  <section class="flex flex-1 flex-col overflow-y-auto">
    {#if error}
      <p class="m-6 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
    {/if}

    {#if !selectedSlug}
      <div class="flex flex-1 items-center justify-center text-sm text-fainter">
        Select a connector to view its details.
      </div>
    {:else if detailLoading && !detail}
      <div class="flex flex-1 items-center justify-center text-sm text-fainter">Loading…</div>
    {:else if detail}
      {@const connected = accountsForSelected.length > 0}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <!-- header -->
        <div class="flex items-start gap-3">
          <ConnectorIcon logoUrl={detail.logoUrl} label={detail.name} size={32} />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-lg font-semibold text-fg">{detail.name}</h2>
              {#if detail.categories[0]}
                <span class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted">{cap(detail.categories[0])}</span>
              {/if}
            </div>
          </div>
          <button
            class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
            class:border={true}
            class:border-border-strong={true}
            class:bg-bg={connected}
            class:text-fg={connected}
            class:bg-primary={!connected}
            class:text-primary-fg={!connected}
            class:border-transparent={!connected}
            onclick={() => { playButtonClick(); void connect(); }}
            disabled={busySlug === detail.slug}
          >
            {#if busySlug === detail.slug}
              …
            {:else if connected}
              {isManual ? "Add another" : "Add account"}
            {:else}
              Connect
            {/if}
          </button>
        </div>

        {#if detail.description}
          <p class="mt-4 text-sm leading-relaxed text-fg-soft">{detail.description}</p>
        {/if}

        {#if formOpen && isManual}
          <form
            class="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
            onsubmit={(e) => { e.preventDefault(); void submitFields(); }}
          >
            {#each detail.authFields as f (f.name)}
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-fg">
                  {f.label}{#if !f.required}<span class="text-fainter"> (optional)</span>{/if}
                </span>
                {#if f.description}
                  <span class="text-xs text-fainter">{f.description}</span>
                {/if}
                <input
                  type={f.secret ? "password" : "text"}
                  class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
                  class:font-mono={f.secret}
                  placeholder={f.secret ? "••••••••" : ""}
                  bind:value={fieldValues[f.name]}
                  data-testid={`field-${f.name}`}
                />
              </label>
            {/each}
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg"
                onclick={() => (formOpen = false)}
              >Cancel</button>
              <button
                type="submit"
                class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50"
                disabled={!formValid || busySlug === detail.slug}
              >{busySlug === detail.slug ? "Connecting…" : "Connect"}</button>
            </div>
          </form>
        {/if}

        <!-- accounts -->
        {#if connected}
          <h3 class="mt-7 text-sm font-semibold text-fg">
            Connected {accountsForSelected.length > 1 ? "accounts" : "account"}
          </h3>
          <div class="mt-2 overflow-hidden rounded-xl border border-border bg-surface">
            {#each accountsForSelected as c, i (c.id)}
              <div class="group flex items-center gap-3 px-3 py-2.5" class:border-t={i > 0} class:border-border={i > 0}>
                <span class="h-1.5 w-1.5 shrink-0 rounded-full {STATUS_DOT[c.status]}"></span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-fg">{accountLabel(c)}</p>
                  <p class="text-xs text-fainter">{STATUS_LABEL[c.status]}</p>
                </div>
                <button
                  class="rounded-md px-2 py-1 text-xs text-fainter opacity-0 transition hover:bg-bg hover:text-red-400 group-hover:opacity-100"
                  onclick={() => disconnect(c)}
                >Disconnect</button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- tools -->
        <h3 class="mt-7 text-sm font-semibold text-fg">Tools <span class="text-fainter">{detail.tools.length}</span></h3>
        <p class="mt-0.5 text-xs text-fainter">Actions the agent can take once connected.</p>
        {#each toolGroups as g (g.label)}
          <div class="mt-4">
            <div class="flex items-center gap-2 px-1">
              <span class="text-xs font-medium text-muted">{g.label}</span>
              <span class="rounded bg-surface px-1.5 text-[11px] text-fainter">{g.tools.length}</span>
            </div>
            <div class="mt-1.5 flex flex-col">
              {#each g.tools as tool (tool.slug)}
                <div class="border-t border-border py-2.5 first:border-t-0">
                  <p class="text-sm text-fg">{tool.name}</p>
                  {#if tool.description}
                    <p class="mt-0.5 line-clamp-2 text-xs text-fainter">{tool.description}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if detail.tools.length === 0 && !detailLoading}
          <p class="mt-3 text-sm text-fainter">No tools listed for this app.</p>
        {/if}
      </div>
    {/if}
  </section>
</main>
