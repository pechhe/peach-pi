<script lang="ts">
  import type { Project, ResourceInspection, ExtensionInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import { clickCopy } from "../lib/code-copy";
  import Search from "@lucide/svelte/icons/search";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Wrench from "@lucide/svelte/icons/wrench";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);
  let query = $state("");
  let loading = $state(false);
  let selectedPath = $state<string | null>(null);

  $effect(() => {
    const target = scope;
    selectedPath = null;
    loading = true;
    void api
      .invoke("resources:inspect", target)
      .then((result) => {
        inspection = result;
      })
      .finally(() => {
        loading = false;
      });
  });

  $effect(() => {
    return api.on("event:resourcesChanged", async () => {
      inspection = await api.invoke("resources:inspect", scope);
    });
  });

  const selected = $derived(
    inspection?.extensions.find((e) => e.path === selectedPath) ?? null,
  );

  const filtered = $derived.by(() => {
    const exts = inspection?.extensions ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return exts;
    return exts.filter(
      (e) => e.name.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
    );
  });

  const groups = $derived.by(() => {
    // "error" gets its own group at the top; rest split by source.
    const order = ["Failed", "Global", "Project", "Other"];
    const map = new Map<string, ExtensionInfo[]>();
    for (const k of order) map.set(k, []);
    for (const e of filtered) {
      const label = e.source === "error" ? "Failed" : e.source === "user" ? "Global" : e.source === "project" ? "Project" : "Other";
      map.get(label)!.push(e);
    }
    return order.map((key) => ({ key, items: map.get(key)! })).filter((g) => g.items.length > 0);
  });

  async function refresh() {
    loading = true;
    try {
      const result = await api.invoke("resources:inspect", scope);
      inspection = result;
      if (selectedPath && !result.extensions.some((e) => e.path === selectedPath)) {
        selectedPath = null;
      }
    } finally {
      loading = false;
    }
  }

  // Remove/uninstall flow drives the Bits UI confirm dialog.
  let pending = $state<ExtensionInfo | null>(null);
  let dialogOpen = $state(false);
  let removing = $state(false);
  let dialogError = $state("");

  function select(e: ExtensionInfo) {
    selectedPath = e.path;
  }

  function startRemove(ext: ExtensionInfo) {
    if (!ext.removeSpec && !ext.deletePath) return;
    dialogError = "";
    pending = ext;
    dialogOpen = true;
  }

  async function confirmRemove() {
    const ext = pending;
    if (!ext || removing) return;
    removing = true;
    dialogError = "";
    try {
      const res = ext.removeSpec
        ? await api.invoke("extensions:remove", ext.removeSpec)
        : await api.invoke("extensions:deleteLocal", ext.deletePath!);
      if (res.ok) {
        dialogOpen = false;
        pending = null;
        if (selectedPath === ext.path) selectedPath = null;
        await refresh();
      } else {
        dialogError = res.error ?? "Failed.";
      }
    } catch (err) {
      dialogError = String(err);
    } finally {
      removing = false;
    }
  }

  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
</script>

<main class="flex h-full flex-1" data-testid="extensions-view">
  <!-- ── Sidebar ─────────────────────────────────────────────── -->
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-bg">
    <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-4">
      <h1 class="text-sm font-semibold text-fg">Extensions</h1>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
        onclick={refresh}
        title="Refresh"
        aria-label="Refresh"
        data-testid="refresh-extensions"
      ><RefreshCw size={15} class={loading ? "animate-spin" : ""} /></button>
    </header>

    <div class="px-3 pb-2">
      <div class="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:border-border-focus">
        <Search size={14} class="shrink-0 text-muted" />
        <input
          class="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fainter"
          placeholder="Search extensions…"
          bind:value={query}
          data-testid="extension-search"
        />
      </div>
    </div>

    <div class="px-3 pb-2">
      <Select
        class="rounded-lg bg-surface px-2 py-1 text-xs"
        value={scope ?? ""}
        onValueChange={(v) => (scope = v || null)}
        items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      />
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      {#if loading && !inspection}
        <p class="px-2 pt-2 text-xs text-fainter">Loading…</p>
      {:else if filtered.length === 0}
        <p class="px-2 pt-3 text-xs text-fainter">
          {inspection && inspection.extensions.length > 0 ? "No matching extensions." : "No extensions found."}
        </p>
      {:else}
        {#each groups as group (group.key)}
          <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">{group.key}</p>
          {#each group.items as ext (ext.path)}
            <button
              class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
              class:bg-surface={selectedPath === ext.path}
              onclick={() => select(ext)}
              data-testid="sidebar-extension"
            >
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted" class:text-red-400={!!ext.error}>
                {#if ext.error}<AlertTriangle size={12} />{:else}<Puzzle size={12} />{/if}
              </span>
              <span class="flex-1 truncate text-sm {selectedPath === ext.path ? 'text-fg' : ext.error ? 'text-red-400' : 'text-muted'}">{ext.name}</span>
              {#if ext.tools.length > 0}
                <span class="rounded-full bg-bg px-1.5 text-[11px] text-muted">{ext.tools.length}</span>
              {/if}
            </button>
          {/each}
        {/each}
      {/if}
    </nav>
  </aside>

  <!-- ── Detail ──────────────────────────────────────────────── -->
  <section class="flex flex-1 flex-col overflow-y-auto">
    {#if selected}
      {@const ext = selected}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted" class:text-red-400={!!ext.error}>
            {#if ext.error}<AlertTriangle size={16} />{:else}<Puzzle size={16} />{/if}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-lg font-semibold text-fg">{ext.name}</h2>
              <span class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted">{cap(ext.source)}</span>
            </div>
            <p class="mt-0.5 truncate font-mono text-[11px] text-fainter" use:clickCopy={ext.path}>{ext.path}</p>
          </div>
          {#if ext.removeSpec || ext.deletePath}
            <button
              class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm font-medium text-fg transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
              onclick={() => startRemove(ext)}
              disabled={removing && pending?.path === ext.path}
              title={ext.removeSpec ? `pi remove ${ext.removeSpec}` : `Delete ${ext.deletePath}`}
              data-testid="remove-extension"
            >
              <Trash2 size={14} /><span>{removing && pending?.path === ext.path ? "Removing…" : ext.removeSpec ? "Uninstall" : "Delete"}</span>
            </button>
          {/if}
        </div>

        {#if ext.error}
          <p class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400" use:clickCopy={ext.error}>{ext.error}</p>
        {:else}
          <dl class="mt-6 overflow-hidden rounded-xl border border-border bg-surface text-sm">
            <div class="flex justify-between gap-4 px-4 py-2.5">
              <dt class="text-muted">Source</dt>
              <dd class="text-fg">{cap(ext.source)}</dd>
            </div>
            <div class="flex justify-between gap-4 border-t border-border px-4 py-2.5">
              <dt class="text-muted">Tools</dt>
              <dd class="text-fg">{ext.tools.length}</dd>
            </div>
            <div class="flex justify-between gap-4 border-t border-border px-4 py-2.5">
              <dt class="text-muted">Commands</dt>
              <dd class="text-fg">{ext.commands.length}</dd>
            </div>
          </dl>

          {#if ext.tools.length > 0}
            <h3 class="mt-6 text-sm font-semibold text-fg flex items-center gap-2"><Wrench size={13} /> Tools <span class="text-fainter">{ext.tools.length}</span></h3>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each ext.tools as t (t)}
                <span class="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-soft">{t}</span>
              {/each}
            </div>
          {/if}

          {#if ext.commands.length > 0}
            <h3 class="mt-6 text-sm font-semibold text-fg flex items-center gap-2"><Puzzle size={13} /> Commands <span class="text-fainter">{ext.commands.length}</span></h3>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each ext.commands as c (c)}
                <span class="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-soft">/{c}</span>
              {/each}
            </div>
          {/if}
        {/if}

        <p class="mt-6 text-[11px] text-fainter">
          Extensions load from <code class="rounded bg-surface px-1">~/.pi/agent/extensions</code> and each project's
          <code class="rounded bg-surface px-1">.pi/extensions</code>. Packages uninstall via <code class="rounded bg-surface px-1">pi remove</code>;
          local extensions are deleted from disk. Changes apply to new sessions.
        </p>
      </div>
    {:else}
      <div class="flex flex-1 items-center justify-center text-sm text-fainter">
        {inspection && inspection.extensions.length > 0 ? "Select an extension to view its details." : "No extensions found."}
      </div>
    {/if}
  </section>
</main>

<ConfirmDialog
  bind:open={dialogOpen}
  title={pending?.removeSpec ? `Uninstall ${pending?.name}?` : `Delete ${pending?.name}?`}
  description={pending?.removeSpec
    ? `Runs: pi remove ${pending.removeSpec}`
    : `Permanently deletes from disk:\n${pending?.deletePath ?? ""}`}
  confirmLabel={pending?.removeSpec ? "Uninstall" : "Delete"}
  destructive
  busy={removing}
  error={dialogError}
  onConfirm={confirmRemove}
/>
