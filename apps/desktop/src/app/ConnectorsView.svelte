<script lang="ts">
  import { onMount } from "svelte";
  import type {
    AgentBrowserState,
    Connection,
    CuaDriverStatus,
    CustomConnection,
    McpServer,
    ToolkitCatalogEntry,
    ToolkitDetail,
    ToolInfo,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import Search from "@lucide/svelte/icons/search";
import Server from "@lucide/svelte/icons/server";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Globe from "@lucide/svelte/icons/globe";
  import Plus from "@lucide/svelte/icons/plus";
  import Link from "@lucide/svelte/icons/link";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ConnectorIcon from "./ConnectorIcon.svelte";

  // Master-detail over the Composio catalogue. Left: connectors grouped by
  // connection state. Right: the selected toolkit's metadata + tool list.
  // Composio owns auth + tokens; toolkits can hold multiple accounts.
  let connections = $state<Connection[]>([]);
  let catalogue = $state<ToolkitCatalogEntry[]>([]);
  let mcpServers = $state<McpServer[]>([]);
  let cuaDriver = $state<CuaDriverStatus | null>(null);
  let agentBrowser = $state<AgentBrowserState | null>(null);
  // Driver is usable only with both macOS permissions granted.
  const cuaNeedsPerms = $derived(
    !!cuaDriver?.installed &&
      (cuaDriver.accessibility !== "granted" || cuaDriver.screenRecording !== "granted"),
  );
  let query = $state("");
  let error = $state("");

  let searchEl = $state<HTMLInputElement | null>(null);
  let selectedSlug = $state<string | null>(null);

  // What the detail pane shows. Custom connections are local (non-Composio).
  let mode = $state<"none" | "toolkit" | "custom" | "custom-new" | "mcp">("none");
  let customConnections = $state<CustomConnection[]>([]);
  let selectedCustom = $state<CustomConnection | null>(null);
  // New-custom form.
  let cName = $state("");
  let cBaseUrl = $state("");
  let cKey = $state("");
  let cHeaderName = $state("Authorization");
  let cHeaderPrefix = $state("Bearer ");
  let cBusy = $state(false);
  const cValid = $derived(!!cName.trim() && !!cBaseUrl.trim() && !!cKey.trim());

  // "+ Add": jump to search so the user can pick any app (incl. manual
  // url+key ones like Metabase). Composio needs a known toolkit, so there is
  // no truly generic connection — adding = finding the app.
  function startAdd() {
    query = "";
    void loadCatalogue();
    searchEl?.focus();
  }
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
    mode = "toolkit";
    selectedSlug = slug;
    selectedCustom = null;
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

  async function loadCustom() {
    customConnections = await api.invoke("customConnections:list");
  }

  async function loadMcp() {
    mcpServers = await api.invoke("mcp:list");
  }

  async function loadCuaDriver() {
    cuaDriver = await api.invoke("cuaDriver:status");
  }

  async function loadAgentBrowser() {
    agentBrowser = await api.invoke("agentBrowser:state");
  }

  async function installAgentBrowser() {
    await api.invoke("agentBrowser:install");
    void loadAgentBrowser();
  }

  async function grantCuaPermissions() {
    await api.invoke("cuaDriver:grantPermissions");
    // Grant is interactive; re-poll shortly so the badge reflects the result.
    setTimeout(() => void loadCuaDriver(), 3000);
  }

  function selectMcp() {
    mode = "mcp";
    selectedSlug = null;
    selectedCustom = null;
  }

  function selectCustom(c: CustomConnection) {
    mode = "custom";
    selectedCustom = c;
    selectedSlug = null;
  }

  function startCustomNew() {
    mode = "custom-new";
    selectedSlug = null;
    selectedCustom = null;
    cName = "";
    cBaseUrl = "";
    cKey = "";
    cHeaderName = "Authorization";
    cHeaderPrefix = "Bearer ";
    error = "";
  }

  async function saveCustom() {
    if (!cValid) return;
    cBusy = true;
    error = "";
    try {
      const created = await api.invoke("customConnections:create", {
        name: cName.trim(),
        baseUrl: cBaseUrl.trim(),
        apiKey: cKey.trim(),
        headerName: cHeaderName.trim() || "Authorization",
        headerPrefix: cHeaderPrefix,
      });
      await loadCustom();
      selectCustom(created);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cBusy = false;
    }
  }

  async function deleteCustom(c: CustomConnection) {
    error = "";
    try {
      await api.invoke("customConnections:delete", c.id);
      await loadCustom();
      if (selectedCustom?.id === c.id) {
        mode = "none";
        selectedCustom = null;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void loadConnections();
    void loadCatalogue();
    void loadCustom();
    void loadMcp();
    void loadCuaDriver();
    void loadAgentBrowser();
    return api.on("event:connectorsChanged", () => {
      void loadConnections();
      void loadCatalogue();
      void loadCustom();
      void loadMcp();
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
    <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-4">
      <h1 class="text-sm font-semibold text-fg">Connectors</h1>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
        onclick={startAdd}
        title="Add a connection"
        aria-label="Add a connection"
        data-testid="add-connection"
      ><Plus size={16} /></button>
    </header>
    <div class="px-3 pb-2">
      <div class="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:border-border-focus">
        <Search size={14} class="shrink-0 text-muted" />
        <input
          bind:this={searchEl}
          class="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fainter"
          placeholder="Search apps to connect…"
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

      <div class="flex items-center justify-between px-2 pb-1 pt-3">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-fainter">Custom</p>
        <button
          class="flex h-5 w-5 items-center justify-center rounded text-fainter transition hover:bg-surface hover:text-fg"
          onclick={startCustomNew}
          title="Add a custom connection"
          aria-label="Add a custom connection"
          data-testid="add-custom"
        ><Plus size={13} /></button>
      </div>
      {#each customConnections as c (c.id)}
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
          class:bg-surface={mode === "custom" && selectedCustom?.id === c.id}
          onclick={() => selectCustom(c)}
          data-testid={`sidebar-custom-${c.id}`}
        >
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Link size={12} /></span>
          <span class="flex-1 truncate text-sm text-fg">{c.name}</span>
        </button>
      {/each}
      {#if customConnections.length === 0}
        <button
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fainter transition-colors hover:bg-surface hover:text-fg"
          onclick={startCustomNew}
        ><Plus size={13} /> Add custom connection</button>
      {/if}

      <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">MCP servers</p>
      {#if mcpServers.length > 0}
        {#each mcpServers as s (s.name)}
          <button
            class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
            class:bg-surface={mode === "mcp"}
            onclick={selectMcp}
            data-testid={`sidebar-mcp-${s.name}`}
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Server size={12} /></span>
            <span class="flex-1 truncate text-sm {mode === "mcp" ? "text-fg" : "text-muted"}">{s.name}</span>
            {#if s.connected}
              <span class="rounded-full bg-bg px-1.5 text-[11px] text-muted" title="{s.toolCount ?? 0} tools">{s.toolCount ?? 0}</span>
            {/if}
          </button>
        {/each}
      {:else}
        <button
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fainter transition-colors hover:bg-surface hover:text-fg"
          onclick={selectMcp}
          data-testid="sidebar-mcp-empty"
        ><Server size={13} /> No MCP servers configured</button>
      {/if}

      <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">Computer use</p>
      {#if agentBrowser}
        <div
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
          data-testid="sidebar-agent-browser"
        >
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Globe size={12} /></span>
          <span class="flex-1 truncate text-sm text-muted">Agent Browser</span>
          {#if agentBrowser.installed}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-emerald-500" title="Native agent_browser tool installed">ready</span>
          {:else}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-fainter">not installed</span>
          {/if}
        </div>
        {#if !agentBrowser.installed}
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fainter transition-colors hover:bg-surface hover:text-fg"
            onclick={installAgentBrowser}
            data-testid="agent-browser-install"
          ><Globe size={13} /> Install native browser tool</button>
        {/if}
      {/if}
      {#if cuaDriver}
        <div
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
          data-testid="sidebar-cua-driver"
        >
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Monitor size={12} /></span>
          <span class="flex-1 truncate text-sm text-muted">Cua Driver</span>
          {#if !cuaDriver.installed}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-fainter">not installed</span>
          {:else if cuaNeedsPerms}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-amber-500" title="Needs Accessibility + Screen Recording">needs access</span>
          {:else if cuaDriver.daemonRunning}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-emerald-500" title="Driver ready{cuaDriver.version ? ` · v${cuaDriver.version}` : ''}">ready</span>
          {:else}
            <span class="rounded-full bg-bg px-1.5 text-[11px] text-muted">idle</span>
          {/if}
        </div>
        {#if cuaNeedsPerms}
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fainter transition-colors hover:bg-surface hover:text-fg"
            onclick={grantCuaPermissions}
            data-testid="cua-grant-permissions"
          ><Monitor size={13} /> Grant permissions</button>
        {/if}
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

    {#if mode === "none"}
      <div class="flex flex-1 items-center justify-center text-sm text-fainter">
        Select a connector to view its details.
      </div>
    {:else if mode === "custom-new"}
      <div class="mx-auto w-full max-w-xl px-8 py-6">
        <h2 class="text-lg font-semibold text-fg">New custom connection</h2>
        <p class="mt-1 text-sm text-fg-soft">
          Save an API key for any HTTP service. The agent calls it with the
          <code class="rounded bg-surface px-1 text-xs">custom_request</code> tool;
          the key is stored on this device and never sent to the model.
        </p>
        <form class="mt-5 flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void saveCustom(); }}>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-fg">Name</span>
            <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
              placeholder="e.g. Metabase" bind:value={cName} data-testid="custom-name" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-fg">Base URL</span>
            <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
              placeholder="https://metabase.acme.com" bind:value={cBaseUrl} data-testid="custom-url" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-fg">API key</span>
            <input type="password" class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-border-focus"
              placeholder="••••••••" bind:value={cKey} data-testid="custom-key" />
          </label>
          <div class="flex gap-3">
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-sm font-medium text-fg">Header name</span>
              <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
                placeholder="Authorization" bind:value={cHeaderName} />
            </label>
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-sm font-medium text-fg">Value prefix</span>
              <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
                placeholder="Bearer " bind:value={cHeaderPrefix} />
            </label>
          </div>
          <p class="-mt-1 text-xs text-fainter">
            Sent as <code class="rounded bg-surface px-1">{cHeaderName || "Authorization"}: {cHeaderPrefix}&lt;key&gt;</code>.
            For Metabase use header <code class="rounded bg-surface px-1">X-API-Key</code> with an empty prefix.
          </p>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={() => (mode = "none")}>Cancel</button>
            <button type="submit" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50"
              disabled={!cValid || cBusy}>{cBusy ? "Saving…" : "Save connection"}</button>
          </div>
        </form>
      </div>
    {:else if mode === "custom" && selectedCustom}
      {@const c = selectedCustom}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><Link size={16} /></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-lg font-semibold text-fg">{c.name}</h2>
              <span class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted">Custom</span>
            </div>
            <p class="truncate text-sm text-fainter">{c.baseUrl}</p>
          </div>
          <button class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm font-medium text-fg transition hover:border-red-500/50 hover:text-red-400"
            onclick={() => deleteCustom(c)} data-testid="custom-delete"><Trash2 size={14} /> Delete</button>
        </div>
        <dl class="mt-6 overflow-hidden rounded-xl border border-border bg-surface text-sm">
          <div class="flex justify-between gap-4 px-4 py-2.5"><dt class="text-muted">Base URL</dt><dd class="truncate text-fg">{c.baseUrl}</dd></div>
          <div class="flex justify-between gap-4 border-t border-border px-4 py-2.5"><dt class="text-muted">Auth header</dt><dd class="font-mono text-fg">{c.headerName}: {c.headerPrefix}{c.keyPreview}</dd></div>
          <div class="flex justify-between gap-4 border-t border-border px-4 py-2.5"><dt class="text-muted">Added</dt><dd class="text-fg">{fmtDate(c.createdAt)}</dd></div>
        </dl>
        <p class="mt-4 text-sm text-fg-soft">
          The agent can call this with <code class="rounded bg-surface px-1 text-xs">custom_request</code>
          — e.g. <code class="rounded bg-surface px-1 text-xs">custom_request(connection: "{c.name}", path: "/api/...")</code>.
        </p>
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
    {:else if mode === "mcp"}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><Server size={16} /></span>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold text-fg">MCP servers</h2>
            <p class="text-sm text-fainter">
              Configured in <code class="rounded bg-surface px-1 text-xs">~/.pi/agent/mcp.json</code> · managed by the pi-mcp-adapter extension.
            </p>
          </div>
        </div>

        {#if mcpServers.length === 0}
          <p class="mt-6 text-sm text-fainter">
            No MCP servers configured. Add them under
            <code class="rounded bg-surface px-1 text-xs">mcpServers</code> in
            <code class="rounded bg-surface px-1 text-xs">~/.pi/agent/mcp.json</code>,
            then reload the thread.
          </p>
        {:else}
          <div class="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
            {#each mcpServers as s, i (s.name)}
              <div class="px-4 py-3" class:border-t={i > 0} class:border-border={i > 0}>
                <div class="flex items-center gap-2">
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full {s.connected ? "bg-emerald-500" : "bg-fainter"}"></span>
                  <span class="text-sm font-medium text-fg">{s.name}</span>
                  {#if s.connected}
                    <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-muted">{s.toolCount ?? 0} tools</span>
                  {:else}
                    <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-fainter">Not connected yet</span>
                  {/if}
                </div>
                {#if s.command}
                  <p class="mt-1 truncate font-mono text-xs text-fainter" title={s.command}>{s.command}</p>
                {/if}
              </div>
            {/each}
          </div>
          <p class="mt-4 text-sm text-fg-soft">
            Connection counts shown here come from the pi-mcp-adapter metadata
            cache and refresh when threads reconnect. peach-pi does not start or
            stop MCP servers — edit the config file and re-run the thread to
            change what's available.
          </p>
        {/if}
      </div>
    {/if}
  </section>
</main>
