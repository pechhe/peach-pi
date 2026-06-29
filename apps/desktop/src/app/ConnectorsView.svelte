<script lang="ts">
  import { onMount } from "svelte";
  import type {
    Connection,
    CliStatus,
    CustomConnection,
    ProposedConnectionConfig,
    McpServer,
    ToolkitCatalogEntry,
    ToolkitDetail,
    ToolInfo,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import Search from "@lucide/svelte/icons/search";
  import Server from "@lucide/svelte/icons/server";
  import Terminal from "@lucide/svelte/icons/terminal";
  import { Switch } from "../components/ui/switch";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import ConnectorIcon from "./ConnectorIcon.svelte";
  import ExecutorConnections from "./ExecutorConnections.svelte";

  // Master-detail over the Composio catalogue. Left: connectors grouped by
  // connection state. Right: the selected toolkit's metadata + tool list.
  // Composio owns auth + tokens; toolkits can hold multiple accounts.
  let connections = $state<Connection[]>([]);
  let catalogue = $state<ToolkitCatalogEntry[]>([]);
  let mcpServers = $state<McpServer[]>([]);
  let mcpToggling = $state<string | null>(null);
  let clis = $state<CliStatus[]>([]);
  let cliBusy = $state<string | null>(null);
  const visibleClis = $derived(clis.filter((c) => !c.hidden));
  const hiddenClis = $derived(clis.filter((c) => c.hidden));
  let query = $state("");
  let error = $state("");

  let searchEl = $state<HTMLInputElement | null>(null);
  let selectedSlug = $state<string | null>(null);

  // What the detail pane shows. Custom connections are local (non-Composio).
  let mode = $state<"none" | "toolkit" | "custom" | "custom-new" | "mcp" | "cli" | "executor">("none");
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

  // ── Assisted setup (utility model reads docs, verifies, proposes config) ──
  type SetupEntry = { kind: "user" | "assistant" | "probe" | "error"; text: string; ok?: boolean };
  let setupTab = $state<"assisted" | "manual">("assisted");
  let sDocs = $state("");
  let sKey = $state("");
  let sName = $state("");
  let setupSessionId = $state<string | null>(null);
  let setupLog = $state<SetupEntry[]>([]);
  let setupStream = $state("");
  let setupBusy = $state(false);
  let setupConfig = $state<ProposedConnectionConfig | null>(null);
  let setupReply = $state("");
  const sValid = $derived(!!sDocs.trim() && !!sKey.trim());

  function flushStream() {
    if (setupStream.trim()) setupLog = [...setupLog, { kind: "assistant", text: setupStream }];
    setupStream = "";
  }

  function resetSetup() {
    if (setupSessionId) void api.invoke("connectionSetup:close", setupSessionId);
    setupSessionId = null;
    setupLog = [];
    setupStream = "";
    setupConfig = null;
    setupBusy = false;
    setupReply = "";
  }

  async function startSetup() {
    if (!sValid || setupBusy) return;
    error = "";
    setupLog = [];
    setupStream = "";
    setupConfig = null;
    setupBusy = true;
    try {
      const { sessionId } = await api.invoke("connectionSetup:start", {
        docs: sDocs.trim(),
        apiKey: sKey.trim(),
        name: sName.trim() || undefined,
      });
      setupSessionId = sessionId;
    } catch (e) {
      setupBusy = false;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function sendSetupReply() {
    const text = setupReply.trim();
    if (!setupSessionId || !text || setupBusy) return;
    setupLog = [...setupLog, { kind: "user", text }];
    setupReply = "";
    setupBusy = true;
    try {
      await api.invoke("connectionSetup:send", setupSessionId, text);
    } catch (e) {
      setupBusy = false;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function saveSetup() {
    if (!setupSessionId || !setupConfig) return;
    error = "";
    // setupConfig is a Svelte $state proxy; send a plain copy so Electron's
    // structured clone (IPC) doesn't choke ("An object could not be cloned").
    const config = {
      name: setupConfig.name,
      baseUrl: setupConfig.baseUrl,
      headerName: setupConfig.headerName,
      headerPrefix: setupConfig.headerPrefix,
    };
    try {
      const created = await api.invoke("connectionSetup:save", setupSessionId, config);
      setupSessionId = null;
      resetSetup();
      await loadCustom();
      selectCustom(created);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Add a custom (non-Composio) HTTP connection: name + base URL + API key.
  // Composio needs a known toolkit, so there is no truly generic Composio
  // connection — finding an app is done via the search box above.
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
    resetSetup();
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

  async function loadClis() {
    clis = await api.invoke("cli:list");
  }

  /** Re-probe every CLI (presence + auth) and refresh the list. */
  async function refreshClis() {
    if (cliBusy !== null) return;
    cliBusy = "*";
    try {
      clis = await api.invoke("cli:refresh");
    } finally {
      cliBusy = null;
    }
  }

  /** Launch a CLI's own interactive login flow (opens a Terminal window). */
  async function loginCli(id: string) {
    if (cliBusy !== null) return;
    cliBusy = id;
    try {
      await api.invoke("cli:login", id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cliBusy = null;
    }
  }

  /** Hide a CLI from the list, or restore a hidden one. */
  async function setCliHidden(id: string, hidden: boolean) {
    if (cliBusy !== null) return;
    cliBusy = id;
    try {
      clis = await api.invoke("cli:setHidden", id, hidden);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cliBusy = null;
    }
  }

  /** Toggle whether an MCP server is in `mcpServers` (enabled) or moved to the
   *  peach-managed stash so pi-mcp-adapter no longer connects to it (disabled).
   *  Applies to new sessions. */
  async function toggleMcp(s: McpServer, nextEnabled: boolean) {
    if (mcpToggling !== null) return;
    mcpToggling = s.name;
    try {
      await api.invoke("mcp:setEnabled", s.name, nextEnabled);
      await loadMcp();
    } catch {
      // surfaced by stale list on next load
    } finally {
      mcpToggling = null;
    }
  }

  function selectMcp() {
    resetSetup();
    mode = "mcp";
    selectedSlug = null;
    selectedCustom = null;
  }

  function selectExecutor() {
    resetSetup();
    mode = "executor";
    selectedSlug = null;
    selectedCustom = null;
  }

  function selectCli() {
    resetSetup();
    mode = "cli";
    selectedSlug = null;
    selectedCustom = null;
  }

  function selectCustom(c: CustomConnection) {
    resetSetup();
    mode = "custom";
    selectedCustom = c;
    selectedSlug = null;
  }

  function startCustomNew() {
    resetSetup();
    setupTab = "assisted";
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
    void loadClis();
    const offs = [
      api.on("event:connectorsChanged", () => {
        void loadConnections();
        void loadCatalogue();
        void loadCustom();
        void loadMcp();
      }),
      api.on("event:clisChanged", () => void loadClis()),
      api.on("event:connSetupDelta", (p) => {
        if (p.sessionId === setupSessionId) setupStream += p.text;
      }),
      api.on("event:connSetupProbe", (p) => {
        if (p.sessionId !== setupSessionId) return;
        flushStream();
        setupLog = [...setupLog, { kind: "probe", text: p.summary, ok: p.ok }];
      }),
      api.on("event:connSetupConfig", (p) => {
        if (p.sessionId === setupSessionId) setupConfig = p.config;
      }),
      api.on("event:connSetupDone", (p) => {
        if (p.sessionId !== setupSessionId) return;
        flushStream();
        if (p.error) setupLog = [...setupLog, { kind: "error", text: p.error }];
        setupBusy = false;
      }),
    ];
    return () => offs.forEach((off) => off());
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
            <span class="num-badge">{t.count}</span>
          {/if}
        </button>
      {/each}
      {#each customConnections as c (c.id)}
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
          class:bg-surface={mode === "custom" && selectedCustom?.id === c.id}
          onclick={() => selectCustom(c)}
          data-testid={`sidebar-custom-${c.id}`}
        >
          <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={20} />
          <span class="flex-1 truncate text-sm text-fg">{c.name}</span>
        </button>
      {/each}

      <button
        class="w-full px-2 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-fainter transition-colors hover:text-fg"
        class:text-fg={mode === "executor"}
        onclick={selectExecutor}
        data-testid="sidebar-executor-header"
      >Executor</button>

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
              <span class="num-badge" title="{s.toolCount ?? 0} tools">{s.toolCount ?? 0}</span>
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

      <button
        class="w-full px-2 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-fainter transition-colors hover:text-fg"
        onclick={selectCli}
        data-testid="sidebar-cli-header"
      >CLIs</button>
      {#each visibleClis as c (c.id)}
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
          class:bg-surface={mode === "cli"}
          onclick={selectCli}
          data-testid={`sidebar-cli-${c.id}`}
        >
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Terminal size={12} /></span>
          <span class="flex-1 truncate text-sm {mode === "cli" ? "text-fg" : "text-muted"}">{c.name}</span>
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full {c.authed ? 'bg-emerald-500' : c.installed ? 'bg-amber-500' : 'bg-fainter'}"
            title={c.authed ? "Authenticated" : c.installed ? "Installed · not authenticated" : "Not installed"}
          ></span>
        </button>
      {/each}

      <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">Not connected</p>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fainter transition-colors hover:bg-surface hover:text-fg"
        onclick={startCustomNew}
        title="Add a custom connection"
        aria-label="Add a custom connection"
        data-testid="add-custom"
      ><Plus size={13} /> Add custom connection</button>
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
        {#if !setupSessionId}
          <div class="mt-3 flex w-fit gap-1 rounded-lg bg-surface p-1 text-sm">
            <button
              class="rounded-md px-3 py-1 transition {setupTab === 'assisted' ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg'}"
              onclick={() => (setupTab = "assisted")}
            >Assisted</button>
            <button
              class="rounded-md px-3 py-1 transition {setupTab === 'manual' ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg'}"
              onclick={() => (setupTab = "manual")}
            >Manual</button>
          </div>
        {/if}

        {#if setupSessionId}
          <!-- ── Assisted chat: model reads docs, probes, proposes config ── -->
          <div class="mt-4 flex flex-col gap-3" data-testid="setup-chat">
            {#each setupLog as e, i (i)}
              {#if e.kind === "probe"}
                <div class="flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-2.5 py-1 text-xs">
                  <span class="h-1.5 w-1.5 rounded-full {e.ok ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                  <span class="font-mono text-muted">{e.text}</span>
                </div>
              {:else if e.kind === "error"}
                <p class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{e.text}</p>
              {:else if e.kind === "user"}
                <div class="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-fg">{e.text}</div>
              {:else}
                <div class="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-fg">{e.text}</div>
              {/if}
            {/each}
            {#if setupStream.trim()}
              <div class="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-fg">{setupStream}</div>
            {/if}
            {#if setupBusy && !setupStream.trim()}
              <div class="self-start text-xs text-fainter">Working…</div>
            {/if}
          </div>

          {#if setupConfig}
            <div class="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4" data-testid="setup-config">
              <p class="text-sm font-semibold text-fg">Proposed connection</p>
              <div class="mt-2 flex flex-col gap-2">
                <label class="flex flex-col gap-1">
                  <span class="text-xs text-muted">Name</span>
                  <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus" bind:value={setupConfig.name} />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs text-muted">Base URL</span>
                  <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus" bind:value={setupConfig.baseUrl} />
                </label>
                <div class="flex gap-2">
                  <label class="flex flex-1 flex-col gap-1">
                    <span class="text-xs text-muted">Header name</span>
                    <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus" bind:value={setupConfig.headerName} />
                  </label>
                  <label class="flex flex-1 flex-col gap-1">
                    <span class="text-xs text-muted">Value prefix</span>
                    <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus" bind:value={setupConfig.headerPrefix} />
                  </label>
                </div>
              </div>
              <div class="mt-3 flex justify-end">
                <button class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg" onclick={() => void saveSetup()} data-testid="setup-save">Save connection</button>
              </div>
            </div>
          {/if}

          <form class="mt-4 flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void sendSetupReply(); }}>
            <input
              class="flex-1 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus disabled:opacity-50"
              placeholder="Reply or answer a question…"
              bind:value={setupReply}
              disabled={setupBusy}
              data-testid="setup-reply"
            />
            <button type="submit" class="rounded-lg bg-surface px-3 py-1.5 text-sm text-fg disabled:opacity-50" disabled={setupBusy || !setupReply.trim()}>Send</button>
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={() => { resetSetup(); mode = "none"; }}>Cancel</button>
          </form>
        {:else if setupTab === "assisted"}
          <p class="mt-3 text-sm text-fg-soft">
            Paste a link to the API docs and your API key. The utility model reads the
            docs, figures out the base URL + auth header, and verifies it with a
            read-only request — it never sees your key.
          </p>
          <form class="mt-5 flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void startSetup(); }}>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-fg">Name <span class="text-fainter">(optional)</span></span>
              <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
                placeholder="e.g. Stripe" bind:value={sName} data-testid="setup-name" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-fg">API docs URL</span>
              <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
                placeholder="https://docs.example.com/api  (or paste docs text)" bind:value={sDocs} data-testid="setup-docs" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-fg">API key</span>
              <input type="password" class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-border-focus"
                placeholder="••••••••" bind:value={sKey} data-testid="setup-key" />
            </label>
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={() => (mode = "none")}>Cancel</button>
              <button type="submit" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50"
                disabled={!sValid || setupBusy}>{setupBusy ? "Setting up…" : "Set up with AI"}</button>
            </div>
          </form>
        {:else}
        <p class="mt-3 text-sm text-fg-soft">
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
        {/if}
      </div>
    {:else if mode === "custom" && selectedCustom}
      {@const c = selectedCustom}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={32} />
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
    {:else if mode === "executor"}
      <ExecutorConnections />
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
                  <div class="ml-auto flex items-center gap-2" title={s.disabled ? "Disabled: restart to disconnect" : "Loaded by pi-mcp-adapter"}>
                    <Switch
                      checked={!s.disabled}
                      disabled={mcpToggling !== null}
                      onCheckedChange={(checked) => void toggleMcp(s, checked)}
                    />
                    <span class="text-xs text-muted">{s.disabled ? "Off" : "On"}</span>
                  </div>
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
            cache and refresh when threads reconnect. Toggle a server off to
            move it out of pi-mcp-adapter's load list; restart the thread for
            the change to take effect.
          </p>
        {/if}
      </div>
    {:else if mode === "cli"}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><Terminal size={16} /></span>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold text-fg">CLIs</h2>
            <p class="text-sm text-fainter">
              Command-line tools the agent uses through its shell. peach-pi detects
              them and runs each tool's own login flow — auth stays in the CLI's
              own config, never in peach-pi.
            </p>
          </div>
          <button
            class="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50"
            onclick={() => void refreshClis()}
            disabled={cliBusy !== null}
            data-testid="cli-recheck"
          >Re-check</button>
        </div>

        {#if visibleClis.length > 0}
          <div class="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
            {#each visibleClis as c, i (c.id)}
              <div class="flex items-center gap-2 px-4 py-3" class:border-t={i > 0} class:border-border={i > 0}>
                <span
                  class="h-1.5 w-1.5 shrink-0 rounded-full {c.authed ? 'bg-emerald-500' : c.installed ? 'bg-amber-500' : 'bg-fainter'}"
                ></span>
                <span class="text-sm font-medium text-fg">{c.name}</span>
                {#if c.version}
                  <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-muted">v{c.version}</span>
                {/if}
                <span class="text-xs text-fainter">
                  {c.authed ? "authenticated" : c.installed ? "not authenticated" : "not installed"}
                </span>
                <div class="ml-auto flex items-center gap-2">
                  {#if !c.installed}
                    <code class="rounded bg-bg px-1.5 py-0.5 text-[11px] text-fainter">{c.installHint}</code>
                  {:else if !c.authed}
                    <button
                      class="rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-fg transition hover:bg-surface disabled:opacity-50"
                      onclick={() => void loginCli(c.id)}
                      disabled={cliBusy !== null}
                      data-testid={`cli-login-${c.id}`}
                    >Authenticate</button>
                  {/if}
                  <a
                    class="text-[11px] text-muted underline-offset-2 hover:text-fg hover:underline"
                    href={c.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >docs</a>
                  <button
                    class="text-fainter transition hover:text-fg disabled:opacity-50"
                    onclick={() => void setCliHidden(c.id, true)}
                    disabled={cliBusy !== null}
                    title="Remove from list"
                    aria-label={`Remove ${c.name} from list`}
                    data-testid={`cli-remove-${c.id}`}
                  ><X size={14} /></button>
                </div>
              </div>
              {#if c.error}
                <p class="px-4 pb-2 text-[11px] text-amber-400">{c.error}</p>
              {/if}
            {/each}
          </div>
        {:else}
          <p class="mt-6 text-sm text-fainter">All CLIs removed. Restore one below.</p>
        {/if}

        {#if hiddenClis.length > 0}
          <p class="px-1 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-fainter">Removed</p>
          <div class="overflow-hidden rounded-xl border border-border bg-surface">
            {#each hiddenClis as c, i (c.id)}
              <div class="flex items-center gap-2 px-4 py-2.5" class:border-t={i > 0} class:border-border={i > 0}>
                <span class="text-sm text-muted">{c.name}</span>
                <button
                  class="ml-auto rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-fg transition hover:bg-surface disabled:opacity-50"
                  onclick={() => void setCliHidden(c.id, false)}
                  disabled={cliBusy !== null}
                  data-testid={`cli-restore-${c.id}`}
                >Restore</button>
              </div>
            {/each}
          </div>
        {/if}
        <p class="mt-4 text-sm text-fg-soft">
          “Authenticate” opens a Terminal window running the tool's own login
          flow. After completing it, click Re-check to update the badge.
        </p>
      </div>
    {/if}
  </section>
</main>
