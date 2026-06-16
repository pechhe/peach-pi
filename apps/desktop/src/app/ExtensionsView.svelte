<script lang="ts">
  import type { Project, ResourceInspection } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);

  $effect(() => {
    const target = scope;
    inspection = null;
    void api.invoke("resources:inspect", target).then((result) => (inspection = result));
  });
</script>

<main class="flex h-full flex-1 flex-col" data-testid="extensions-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-3 px-6">
    <h1 class="text-sm font-medium text-fg-soft">Extensions</h1>
    <select
      class="rounded border border-border-strong bg-surface px-2 py-0.5 text-xs text-fg-soft outline-none"
      value={scope ?? ""}
      onchange={(e) => (scope = e.currentTarget.value || null)}
    >
      <option value="">Global only</option>
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    {#if !inspection}
      <p class="text-xs text-fainter">Loading…</p>
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-2">
        {#each inspection.extensions as ext (ext.path)}
          <div
            class="rounded-lg border px-4 py-3
              {ext.error ? 'border-danger-border bg-danger-surface/30' : 'border-border bg-surface/50'}"
          >
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-fg">{ext.name}</span>
              <span class="text-[11px] text-faint">{ext.source}</span>
            </div>
            <p class="mt-0.5 truncate font-mono text-[11px] text-fainter">{ext.path}</p>
            {#if ext.error}
              <p class="mt-1 text-xs text-danger">{ext.error}</p>
            {:else}
              <p class="mt-1 text-xs text-faint">
                {ext.tools.length} tools
                {#if ext.tools.length > 0}<span class="text-fainter"> · {ext.tools.join(", ")}</span>{/if}
                · {ext.commands.length} commands
                {#if ext.commands.length > 0}<span class="text-fainter"> · /{ext.commands.join(", /")}</span>{/if}
              </p>
            {/if}
          </div>
        {:else}
          <p class="text-xs text-fainter">No extensions found.</p>
        {/each}
        <p class="mt-2 text-[11px] text-fainter">
          Extensions load from ~/.pi/agent/extensions and each project's .pi/extensions. Manage them
          with the pi CLI; changes apply to new sessions.
        </p>
      </div>
    {/if}
  </div>
</main>
