<script lang="ts">
  import {
    EXECUTOR_PRESETS,
    type ExecCatalogueItem,
    type ExecConnection,
    type ExecPreset,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { executorStore, execDisplayName } from "../lib/executor-store.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  /** Last handoff hint after a Connect/Add click (the user finishes in
   *  Executor's web UI; we can't observe completion, so prompt a refresh). */
  let handoff = $state<string | null>(null);

  // Connect dialog (open state + catalogue live in the store).
  let query = $state("");
  let detecting = $state(false);
  /** Registry rows shown in the popular area beyond the curated 36. */
  let shownExtra = $state(0);
  const SHOW_STEP = 50;
  const presetKeys = new Set(EXECUTOR_PRESETS.map((p) => `${p.pluginKey}:${p.id}`));

  /** Manual "add integration type" buttons, mirroring Executor's dialog. */
  const MANUAL: { key: string; label: string }[] = [
    { key: "openapi", label: "OpenAPI" },
    { key: "google", label: "Google" },
    { key: "microsoft", label: "Microsoft" },
    { key: "mcp", label: "MCP" },
    { key: "graphql", label: "GraphQL" },
  ];

  /** Treats input as a URL/host (paste-to-detect) vs a preset search term —
   *  mirrors Executor's own heuristic. */
  function looksLikeUrl(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    return (
      /^[a-z][a-z0-9+\-.]*:\/\//i.test(t) ||
      t.includes("/") ||
      /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?$/i.test(t)
    );
  }

  const isUrl = $derived(looksLikeUrl(query));
  const q = $derived((isUrl ? "" : query).trim().toLowerCase());
  const searching = $derived(q.length > 0);
  const presetMatches = $derived.by(() => {
    if (!q) return EXECUTOR_PRESETS;
    return EXECUTOR_PRESETS.filter((p) =>
      `${p.name} ${p.summary} ${p.pluginKey}`.toLowerCase().includes(q),
    );
  });
  // Registry rows not already covered by a curated preset (popular-area tail).
  const registryExtra = $derived(
    executorStore.catalogue.filter((i) => !presetKeys.has(`${i.kind}:${i.slug}`)),
  );
  const popularExtra = $derived(registryExtra.slice(0, shownExtra));
  // Search spans the full registry, not just the curated 36.
  const searchResults = $derived.by(() => {
    if (!searching) return [] as ExecCatalogueItem[];
    return executorStore.catalogue
      .filter((i) => `${i.name} ${i.description} ${i.slug} ${i.kind}`.toLowerCase().includes(q))
      .slice(0, 200);
  });

  // The integration shown in the detail pane (selection lives in the store, set
  // from the sidebar in ConnectorsView).
  const selected = $derived(executorStore.selected);
  const conns = $derived(
    executorStore.byIntegration.get(executorStore.selectedSlug ?? "") ?? [],
  );
  const headerSubtitle = $derived(
    selected && selected.description && selected.description !== execDisplayName(selected.slug)
      ? selected.description
      : "Local connections proxy. Integrations are services; each holds many connections. Secrets stay in Executor — connecting opens its local window to enter the credential.",
  );

  function openConnect() {
    executorStore.connectOpen = true;
  }

  // Reset dialog fields + lazy-load the registry whenever the dialog opens
  // (including when opened from the sidebar "+").
  $effect(() => {
    if (!executorStore.connectOpen) return;
    query = "";
    error = null;
    shownExtra = 0;
    void executorStore.loadCatalogue();
  });

  /** Opens Executor's signed-in add page, then closes + prompts a refresh. */
  async function openAdd(pluginKey: string, opts: { preset?: string; url?: string; namespace?: string }) {
    try {
      await api.invoke("executor:openAddPage", pluginKey, opts);
      executorStore.connectOpen = false;
      handoff = "Finish in the Executor window — this list updates when you return.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function pickPreset(p: ExecPreset) {
    void openAdd(p.pluginKey, { preset: p.id, ...(p.url ? { url: p.url } : {}) });
  }

  /** Registry rows are discovery-only. With a URL, run Detect; otherwise open
   *  the manual add page for that kind so the user can paste a spec. */
  async function pickCatalogue(it: ExecCatalogueItem) {
    if (it.url) {
      query = it.url;
      await detect();
    } else {
      await openAdd(it.kind, { namespace: it.slug });
    }
  }

  /** Favicon via Google's service (CSP-allowed), keyed by the brand domain —
   *  mirrors how Executor's own UI resolves integration icons. */
  function faviconUrl(domain: string | undefined): string | null {
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
  }

  /** googleDiscovery → google; otherwise the kind is already the plugin key. */
  function kindToPlugin(kind: string): string {
    return kind === "googleDiscovery" ? "google" : kind;
  }

  async function detect() {
    const url = query.trim();
    if (!url || detecting) return;
    detecting = true;
    error = null;
    try {
      const results = await api.invoke("executor:detect", url);
      const best = [...results].sort(
        (a, b) =>
          ({ high: 3, medium: 2, low: 1 })[b.confidence] -
          ({ high: 3, medium: 2, low: 1 })[a.confidence],
      )[0];
      if (!best) {
        error = "Could not detect an integration type from this URL. Try adding manually.";
        return;
      }
      await openAdd(kindToPlugin(best.kind), { url, namespace: best.slug });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      detecting = false;
    }
  }

  /** Add an account to an existing integration (createHandoff → web UI). */
  async function addConnection(integration: string) {
    if (busy) return;
    busy = `add:${integration}`;
    handoff = null;
    try {
      const r = await api.invoke("executor:addConnection", integration);
      handoff = r.instructions || "Finish in the Executor window, then Refresh.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  async function removeConnection(c: ExecConnection) {
    if (busy) return;
    busy = `rm:${c.integration}:${c.name}`;
    try {
      await api.invoke("executor:removeConnection", c.owner, c.integration, c.name);
      await executorStore.load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

</script>

<div class="mx-auto w-full max-w-3xl px-8 py-6" data-testid="executor-connections">
  <div class="flex items-start gap-3">
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><ExternalLink size={16} /></span>
    <div class="min-w-0 flex-1">
      <h2 class="text-lg font-semibold text-fg">{selected ? execDisplayName(selected.slug) : "Executor"}</h2>
      <p class="text-sm text-fainter">{headerSubtitle}</p>
    </div>
    <button
      class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
      onclick={() => void executorStore.load()}
      data-testid="executor-refresh"
    ><RefreshCw size={13} /> Refresh</button>
    <button
      class="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:opacity-90"
      onclick={openConnect}
      data-testid="executor-connect"
    ><Plus size={14} /> Connect</button>
  </div>

  {#if handoff}
    <p class="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg-soft" data-testid="executor-handoff">
      {handoff}
    </p>
  {/if}
  {#if error || executorStore.error}
    <p class="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" data-testid="executor-error">
      {error ?? executorStore.error}
    </p>
  {/if}

  {#if executorStore.loading}
    <p class="mt-6 text-sm text-fainter">Loading…</p>
  {:else if executorStore.integrations.length === 0}
    <div class="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16">
      <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-muted"><Plus size={20} /></span>
      <p class="mb-1 text-sm font-medium text-fg-soft">No integrations yet</p>
      <p class="mb-5 text-[13px] text-fainter">Connect an integration to start curating tools.</p>
      <button
        class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:opacity-90"
        onclick={openConnect}
      ><Plus size={14} /> Connect an integration</button>
    </div>
  {:else if selected}
    <div class="mt-6 overflow-hidden rounded-xl border border-border bg-surface" data-testid={`executor-integration-${selected.slug}`}>
      <div class="flex items-center gap-2 px-4 py-3">
        <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-fainter">{selected.kind}</span>
        <button
          class="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-50"
          disabled={busy === `add:${selected.slug}`}
          onclick={() => void addConnection(selected.slug)}
          data-testid={`executor-add-${selected.slug}`}
        ><Plus size={12} /> {busy === `add:${selected.slug}` ? "Opening…" : "Add connection"}</button>
      </div>
      {#if conns.length > 0}
        {#each conns as c (c.name)}
          <div class="flex items-center gap-2 border-t border-border px-4 py-2" data-testid={`executor-conn-${selected.slug}-${c.name}`}>
            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"></span>
            <span class="text-sm text-fg">{c.identityLabel || c.name}</span>
            {#if c.isOAuth}
              <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-muted">OAuth</span>
            {/if}
            <button
              class="ml-auto rounded-md p-1 text-fainter transition-colors hover:bg-bg hover:text-rose-400 disabled:opacity-50"
              disabled={busy === `rm:${c.integration}:${c.name}`}
              onclick={() => void removeConnection(c)}
              title="Remove connection"
              aria-label="Remove connection"
              data-testid={`executor-rm-${selected.slug}-${c.name}`}
            ><Trash2 size={13} /></button>
          </div>
        {/each}
      {:else}
        <p class="border-t border-border px-4 py-3 text-sm text-fainter">No connections yet. Use “Add connection” to add one.</p>
      {/if}
    </div>
  {/if}
</div>

{#snippet row(p: { name: string; summary: string; domain?: string; badge: string; onpick: () => void; testid: string })}
  <button
    class="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface"
    onclick={p.onpick}
    data-testid={p.testid}
  >
    {#if faviconUrl(p.domain)}
      <img src={faviconUrl(p.domain)} alt="" class="h-5 w-5 shrink-0 object-contain" />
    {:else}
      <span class="h-5 w-5 shrink-0 rounded bg-surface"></span>
    {/if}
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm text-fg">{p.name}</span>
      <span class="truncate text-xs text-fainter">{p.summary}</span>
    </span>
    <span class="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted uppercase">{p.badge}</span>
  </button>
{/snippet}

{#if executorStore.connectOpen}
  <!-- Connect dialog: mirrors Executor's "Connect an integration" flow. -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="presentation"
    onclick={(e) => { if (e.target === e.currentTarget) executorStore.connectOpen = false; }}
  >
    <div class="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-xl" data-testid="executor-connect-dialog">
      <div class="flex items-start gap-3 border-b border-border px-5 py-4">
        <div class="min-w-0 flex-1">
          <h3 class="text-base font-semibold text-fg">Connect an integration</h3>
          <p class="mt-0.5 text-xs text-fainter">Search the preset library, or paste a URL to auto-detect.</p>
        </div>
        <button class="rounded-md p-1 text-fainter hover:text-fg" onclick={() => (executorStore.connectOpen = false)} aria-label="Close"><X size={16} /></button>
      </div>

      <div class="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
        <!-- Search / paste -->
        <div class="flex flex-col gap-2">
          <div class="flex gap-2">
            <div class="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:border-border-focus">
              <Search size={14} class="shrink-0 text-fainter" />
              <input
                class="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fainter"
                placeholder="Search all integrations, or paste a URL"
                bind:value={query}
                onkeydown={(e) => { if (e.key === "Enter" && isUrl) void detect(); }}
                data-testid="executor-connect-search"
              />
            </div>
            {#if isUrl}
              <button
                class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 disabled:opacity-50"
                disabled={detecting || !query.trim()}
                onclick={() => void detect()}
                data-testid="executor-connect-detect"
              >{detecting ? "Detecting…" : "Detect"}</button>
            {/if}
          </div>
        </div>

        <!-- Manual add -->
        <div class="flex flex-col gap-2">
          <p class="text-xs font-medium text-fg-soft/80">Or add manually</p>
          <div class="flex flex-wrap gap-2">
            {#each MANUAL as m (m.key)}
              <button
                class="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
                onclick={() => void openAdd(m.key, {})}
                data-testid={`executor-manual-${m.key}`}
              >{m.label}</button>
            {/each}
          </div>
        </div>

        <!-- Popular (curated 36 + registry tail) / full-registry search -->
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-fg-soft/80">{searching ? "Results" : "Popular integrations"}</p>
            {#if searching}
              <span class="text-[11px] text-fainter">{presetMatches.length + searchResults.length} found</span>
            {/if}
          </div>
          <div class="max-h-[48vh] overflow-y-auto rounded-lg border border-border">
            {#if searching}
              {#if presetMatches.length === 0 && searchResults.length === 0}
                <div class="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                  <p class="text-sm text-muted">No matching integrations</p>
                  <p class="text-xs text-fainter">Paste a URL above to auto-detect, or pick a type manually.</p>
                </div>
              {:else}
                {#each presetMatches as p (`p-${p.pluginKey}-${p.id}`)}
                  {@render row({ name: p.name, summary: p.summary, domain: p.domain, badge: p.pluginKey, onpick: () => pickPreset(p), testid: `executor-preset-${p.pluginKey}-${p.id}` })}
                {/each}
                {#each searchResults as it (`c-${it.kind}-${it.slug}`)}
                  {@render row({ name: it.name, summary: it.description, domain: it.domain, badge: it.kind, onpick: () => void pickCatalogue(it), testid: `executor-cat-${it.kind}-${it.slug}` })}
                {/each}
              {/if}
            {:else}
              {#each EXECUTOR_PRESETS as p (`p-${p.pluginKey}-${p.id}`)}
                {@render row({ name: p.name, summary: p.summary, domain: p.domain, badge: p.pluginKey, onpick: () => pickPreset(p), testid: `executor-preset-${p.pluginKey}-${p.id}` })}
              {/each}
              {#each popularExtra as it (`c-${it.kind}-${it.slug}`)}
                {@render row({ name: it.name, summary: it.description, domain: it.domain, badge: it.kind, onpick: () => void pickCatalogue(it), testid: `executor-cat-${it.kind}-${it.slug}` })}
              {/each}
            {/if}
          </div>
          {#if !searching && shownExtra < registryExtra.length}
            <button
              class="self-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
              onclick={() => (shownExtra += SHOW_STEP)}
              data-testid="executor-show-more"
            >Show 50 more <span class="text-fainter">· {registryExtra.length - shownExtra} remaining</span></button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
