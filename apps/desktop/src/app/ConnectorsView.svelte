<script lang="ts">
  import { onMount } from "svelte";
  import type { CliStatus, McpServer } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Server from "@lucide/svelte/icons/server";
  import Terminal from "@lucide/svelte/icons/terminal";
  import Plug from "@lucide/svelte/icons/plug";
  import X from "@lucide/svelte/icons/x";
  import { Switch } from "../components/ui/switch";
  import ExecutorConnections from "./ExecutorConnections.svelte";

  // Connections surface. Executor is the primary connections backbone (its own
  // self-contained panel); MCP servers and CLIs are read-only/affordance views.
  let mcpServers = $state<McpServer[]>([]);
  let mcpToggling = $state<string | null>(null);
  let clis = $state<CliStatus[]>([]);
  let cliBusy = $state<string | null>(null);
  const visibleClis = $derived(clis.filter((c) => !c.hidden));
  const hiddenClis = $derived(clis.filter((c) => c.hidden));
  let error = $state("");

  // What the detail pane shows. Opens on Executor (the primary view).
  let mode = $state<"executor" | "mcp" | "cli">("executor");

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

  onMount(() => {
    void loadMcp();
    void loadClis();
    const off = api.on("event:clisChanged", () => void loadClis());
    return off;
  });
</script>

<main class="flex h-full flex-1" data-testid="connections-view">
  <!-- ── Sidebar ─────────────────────────────────────────────── -->
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-bg">
    <header class="titlebar-drag flex h-12 shrink-0 items-center px-4">
      <h1 class="text-sm font-semibold text-fg">Connections</h1>
    </header>

    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      <button
        class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
        class:bg-surface={mode === "executor"}
        onclick={() => (mode = "executor")}
        data-testid="sidebar-executor"
      >
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><Plug size={12} /></span>
        <span class="flex-1 truncate text-sm {mode === 'executor' ? 'text-fg' : 'text-muted'}">Executor</span>
      </button>

      <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">MCP servers</p>
      {#if mcpServers.length > 0}
        {#each mcpServers as s (s.name)}
          <button
            class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
            class:bg-surface={mode === "mcp"}
            onclick={() => (mode = "mcp")}
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
          onclick={() => (mode = "mcp")}
          data-testid="sidebar-mcp-empty"
        ><Server size={13} /> No MCP servers configured</button>
      {/if}

      <button
        class="w-full px-2 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-fainter transition-colors hover:text-fg"
        onclick={() => (mode = "cli")}
        data-testid="sidebar-cli-header"
      >CLIs</button>
      {#each visibleClis as c (c.id)}
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
          class:bg-surface={mode === "cli"}
          onclick={() => (mode = "cli")}
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
    </nav>
  </aside>

  <!-- ── Detail ──────────────────────────────────────────────── -->
  <section class="flex flex-1 flex-col overflow-y-auto">
    {#if error}
      <div class="mx-auto mt-6 w-full max-w-3xl px-8">
        <p class="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>
      </div>
    {/if}

    {#if mode === "executor"}
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
