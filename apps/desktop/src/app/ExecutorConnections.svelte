<script lang="ts">
  import { onMount } from "svelte";
  import type { ExecConnection, ExecIntegration } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ExternalLink from "@lucide/svelte/icons/external-link";

  let integrations = $state<ExecIntegration[]>([]);
  let connections = $state<ExecConnection[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  /** Last handoff hint after an "Add connection" click (the user finishes in
   *  Executor's web UI; we can't observe completion, so prompt a refresh). */
  let handoff = $state<string | null>(null);

  // Add-OpenAPI form.
  let addOpen = $state(false);
  let oaUrl = $state("");
  let oaSlug = $state("");

  // Connections grouped by integration slug.
  const byIntegration = $derived.by(() => {
    const m = new Map<string, ExecConnection[]>();
    for (const c of connections) {
      const list = m.get(c.integration) ?? [];
      list.push(c);
      m.set(c.integration, list);
    }
    return m;
  });

  async function load() {
    error = null;
    try {
      const [ints, conns] = await Promise.all([
        api.invoke("executor:integrations"),
        api.invoke("executor:connections"),
      ]);
      integrations = ints;
      connections = conns;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

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
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  async function addOpenApi() {
    if (busy || !oaUrl.trim() || !oaSlug.trim()) return;
    busy = "openapi";
    try {
      await api.invoke("executor:addOpenApi", oaUrl.trim(), oaSlug.trim());
      oaUrl = "";
      oaSlug = "";
      addOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  onMount(() => {
    void load();
    const off = api.on("event:executorChanged", () => void load());
    return off;
  });
</script>

<div class="mx-auto w-full max-w-3xl px-8 py-6" data-testid="executor-connections">
  <div class="flex items-start gap-3">
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><ExternalLink size={16} /></span>
    <div class="min-w-0 flex-1">
      <h2 class="text-lg font-semibold text-fg">Executor</h2>
      <p class="text-sm text-fainter">
        Local connections proxy. Integrations are services; each can hold many
        connections. Secrets stay in Executor — adding a connection opens its
        local window to enter the credential.
      </p>
    </div>
    <button
      class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
      onclick={() => void load()}
      data-testid="executor-refresh"
    ><RefreshCw size={13} /> Refresh</button>
  </div>

  {#if handoff}
    <p class="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg-soft" data-testid="executor-handoff">
      {handoff}
    </p>
  {/if}
  {#if error}
    <p class="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" data-testid="executor-error">
      {error}
    </p>
  {/if}

  {#if loading}
    <p class="mt-6 text-sm text-fainter">Loading…</p>
  {:else}
    <!-- Add OpenAPI integration -->
    <div class="mt-6">
      {#if addOpen}
        <div class="rounded-xl border border-border bg-surface p-4">
          <h3 class="text-sm font-semibold text-fg">Add OpenAPI integration</h3>
          <p class="mt-1 text-xs text-fainter">Paste a spec URL; Executor indexes its operations as tools.</p>
          <input
            class="mt-3 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
            placeholder="https://api.example.com/openapi.json"
            bind:value={oaUrl}
            data-testid="executor-openapi-url"
          />
          <input
            class="mt-2 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
            placeholder="slug (e.g. example)"
            bind:value={oaSlug}
            data-testid="executor-openapi-slug"
          />
          <div class="mt-3 flex items-center gap-2">
            <button
              class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 disabled:opacity-50"
              disabled={busy === "openapi" || !oaUrl.trim() || !oaSlug.trim()}
              onclick={() => void addOpenApi()}
              data-testid="executor-openapi-add"
            >{busy === "openapi" ? "Adding…" : "Add"}</button>
            <button class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={() => (addOpen = false)}>Cancel</button>
          </div>
        </div>
      {:else}
        <button
          class="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
          onclick={() => (addOpen = true)}
          data-testid="executor-openapi-open"
        ><Plus size={14} /> Add OpenAPI integration</button>
      {/if}
    </div>

    {#if integrations.length === 0}
      <p class="mt-6 text-sm text-fainter">No integrations yet.</p>
    {:else}
      <div class="mt-4 space-y-3">
        {#each integrations as integ (integ.slug)}
          {@const conns = byIntegration.get(integ.slug) ?? []}
          <div class="overflow-hidden rounded-xl border border-border bg-surface" data-testid={`executor-integration-${integ.slug}`}>
            <div class="flex items-center gap-2 px-4 py-3">
              <span class="text-sm font-medium text-fg">{integ.description || integ.slug}</span>
              <span class="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-fainter">{integ.kind}</span>
              <button
                class="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-bg hover:text-fg disabled:opacity-50"
                disabled={busy === `add:${integ.slug}`}
                onclick={() => void addConnection(integ.slug)}
                data-testid={`executor-add-${integ.slug}`}
              ><Plus size={12} /> {busy === `add:${integ.slug}` ? "Opening…" : "Add connection"}</button>
            </div>
            {#if conns.length > 0}
              {#each conns as c (c.name)}
                <div class="flex items-center gap-2 border-t border-border px-4 py-2" data-testid={`executor-conn-${integ.slug}-${c.name}`}>
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
                    data-testid={`executor-rm-${integ.slug}-${c.name}`}
                  ><Trash2 size={13} /></button>
                </div>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
