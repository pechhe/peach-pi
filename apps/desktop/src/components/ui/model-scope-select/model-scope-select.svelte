<script lang="ts">
  import { Popover } from "bits-ui";
  import { cn } from "../../../lib/utils";
  import { scopedModels } from "../../../stores/scoped-models.svelte";
  import type { ScopedModel } from "@peach-pi/shared-types";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  let {
    open = $bindable(false),
    class: className,
    floating = false,
  }: { open?: boolean; class?: string; floating?: boolean } = $props();

  let query = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);
  /** Expanded provider groups (collapsed by default). While searching, every
   *  group is forced open regardless of this set. */
  let expanded = $state<Set<string>>(new Set());

  const q = $derived(query.trim().toLowerCase());
  const searching = $derived(q.length > 0);
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

  function isExpanded(provider: string): boolean {
    return searching || expanded.has(provider);
  }
  function toggleGroup(provider: string) {
    // No-op while searching — groups stay open.
    if (searching) return;
    const next = new Set(expanded);
    next.has(provider) ? next.delete(provider) : next.add(provider);
    expanded = next;
  }

  function scopeAll() {
    for (const m of filtered) if (!m.scoped) void scopedModels.toggle(m.provider, m.id, true);
  }
  function scopeNone() {
    for (const m of filtered) if (m.scoped) void scopedModels.toggle(m.provider, m.id, false);
  }

  // Reset the filter whenever the panel closes.
  $effect(() => {
    if (!open) query = "";
  });

  // When the floating `/scoped-models` panel opens, grab focus into the
  // search box so typing filters immediately instead of landing in the
  // composer's textarea. `autofocus` alone doesn't reliably steal focus
  // from the already-focused textarea when opened imperatively.
  $effect(() => {
    if (open && floating && searchInput) {
      requestAnimationFrame(() => searchInput?.focus());
    }
  });

  /** Open inline from the composer's `/scoped-models` command. Ensures the
   *  model list is loaded (settings may never have been opened). */
  export async function openScopedModels() {
    await scopedModels.load();
    open = true;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (floating && open && e.key === "Escape") open = false;
  }}
/>

{#snippet body()}
  <div class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1">
    <Search class="size-3.5 shrink-0 text-faint" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:this={searchInput}
      type="search"
      bind:value={query}
      placeholder="Search models…"
      autofocus
      class="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fainter"
      data-testid="scoped-models-search"
    />
    {#if floating}
      <button
        type="button"
        class="shrink-0 text-faint hover:text-fg"
        onclick={() => (open = false)}
        aria-label="Close"
      ><X class="size-3.5" /></button>
    {/if}
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

  <div class="flex-1 min-h-0 overflow-y-auto">
    {#if total === 0}
      <p class="px-2 py-4 text-center text-xs text-faint" data-testid="scoped-models-empty">
        No models available. Configure provider auth in pi first.
      </p>
    {:else if grouped.length === 0}
      <p class="px-2 py-4 text-center text-xs text-faint">No models match “{query}”.</p>
    {:else}
      {#each grouped as group (group.provider)}
        <div class="mb-0.5">
          <button
            type="button"
            class="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-surface px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-fainter hover:text-fg-soft"
            onclick={() => toggleGroup(group.provider)}
            aria-expanded={isExpanded(group.provider)}
            data-testid={`scope-group-${group.provider}`}
          >
            <ChevronDown class={cn("size-3 shrink-0 transition-transform", !isExpanded(group.provider) && "-rotate-90")} />
            <span>{group.provider}</span>
            <span class="ml-auto normal-case tracking-normal text-fainter/70">
              {group.items.filter((m) => m.scoped).length}/{group.items.length}
            </span>
          </button>
          {#if isExpanded(group.provider)}
            {#each group.items as m (`${m.provider}:${m.id}`)}
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 pl-6 text-left text-xs outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2"
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
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#if floating}
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50" onclick={() => (open = false)}></div>
    <div
      data-testid="scoped-models-content"
      class="fixed top-1/2 z-50 flex h-[80vh] max-h-[80vh] w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3 shadow-2xl"
      style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)"
    >
      {@render body()}
    </div>
  {/if}
{:else}
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
        {@render body()}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{/if}
