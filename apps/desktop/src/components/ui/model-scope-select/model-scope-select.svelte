<script lang="ts">
  import { Popover } from "bits-ui";
  import { cn } from "../../../lib/utils";
  import { scopedModels } from "../../../stores/scoped-models.svelte";
  import type { ScopedModel } from "@peach-pi/shared-types";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Search from "@lucide/svelte/icons/search";

  let {
    open = $bindable(false),
    class: className,
  }: { open?: boolean; class?: string } = $props();

  let query = $state("");

  const q = $derived(query.trim().toLowerCase());
  const total = $derived(scopedModels.models.length);
  const scopedCount = $derived(scopedModels.models.filter((m) => m.scoped).length);
  const scopedAll = $derived(total > 0 && scopedCount === total);

  const filtered = $derived.by(() => {
    if (!q) return scopedModels.models;
    return scopedModels.models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  });
  const grouped = $derived.by(() => {
    const groups = new Map<string, ScopedModel[]>();
    for (const m of filtered) {
      const arr = groups.get(m.provider);
      if (arr) arr.push(m);
      else groups.set(m.provider, [m]);
    }
    return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
  });

  function toggle(m: ScopedModel) {
    void scopedModels.toggle(m.provider, m.id, !m.scoped);
  }

  function scopeAll() {
    for (const m of filtered) if (!m.scoped) void scopedModels.toggle(m.provider, m.id, true);
  }
  function scopeNone() {
    for (const m of filtered) if (m.scoped) void scopedModels.toggle(m.provider, m.id, false);
  }

  // Reset the filter whenever the popover closes.
  $effect(() => {
    if (!open) query = "";
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    data-testid="scoped-models-trigger"
    class={cn(
      "flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none transition-colors hover:border-border-focus focus:border-border-focus data-[state=open]:border-border-focus",
      className,
    )}
  >
    <span class="truncate text-fg-soft">
      {#if total === 0}
        No models
      {:else}
        {scopedCount} of {total} scoped{#if scopedAll} (all){/if}
      {/if}
    </span>
    <ChevronDown class="size-4 shrink-0 text-faint" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      data-testid="scoped-models-content"
      sideOffset={4}
      class="z-50 flex max-h-96 min-w-80 flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2 shadow-lg outline-none"
    >
      <div class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1">
        <Search class="size-3.5 shrink-0 text-faint" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="search"
          bind:value={query}
          placeholder="Search models…"
          autofocus
          class="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fainter"
          data-testid="scoped-models-search"
        />
      </div>

      <div class="flex items-center justify-between text-[11px] text-faint">
        <span data-testid="scoped-models-count">
          {scopedCount} of {total} scoped{#if scopedAll} (all — empty scope){/if}
        </span>
        <div class="flex gap-1">
          <button
            type="button"
            class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3 disabled:opacity-40"
            onclick={scopeAll}
            disabled={scopedAll}
            data-testid="scope-all"
          >All</button>
          <button
            type="button"
            class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3 disabled:opacity-40"
            onclick={scopeNone}
            disabled={scopedCount === 0}
            data-testid="scope-none"
          >None</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        {#if total === 0}
          <p class="px-2 py-4 text-center text-xs text-faint" data-testid="scoped-models-empty">
            No models available. Configure provider auth in pi first.
          </p>
        {:else if grouped.length === 0}
          <p class="px-2 py-4 text-center text-xs text-faint">No models match “{query}”.</p>
        {:else}
          {#each grouped as group (group.provider)}
            <div class="mb-1">
              <div class="sticky top-0 bg-surface px-2 py-1 text-[11px] uppercase tracking-wide text-fainter">
                {group.provider}
              </div>
              {#each group.items as m (`${m.provider}:${m.id}`)}
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2"
                  onclick={() => toggle(m)}
                  data-testid={`scope-toggle-${m.provider}-${m.id}`}
                >
                  <span class="min-w-0 truncate text-fg" title={m.name}>{m.name}</span>
                  {#if m.scoped}
                    <Check class="size-3.5 shrink-0 text-emerald-500" />
                  {:else}
                    <span class="size-3.5 shrink-0 rounded-sm border border-border-strong"></span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
