<script lang="ts">
  import type { Project, Thread } from "@peach-pi/shared-types";

  let {
    projects,
    threads,
    onSelect,
    onClose,
  }: {
    projects: Project[];
    threads: Thread[];
    onSelect: (threadId: string) => void;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "");

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const pool = threads.filter((t) => !t.archivedAt);
    if (!q) return pool.slice(0, 10);
    return pool
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) || projectName(t.projectId).toLowerCase().includes(q),
      )
      .slice(0, 10);
  });

  $effect(() => {
    void matches;
    index = 0;
  });
  $effect(() => {
    inputEl?.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % Math.max(1, matches.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + matches.length) % Math.max(1, matches.length);
    }
    const match = matches[index];
    if (e.key === "Enter" && match) {
      onSelect(match.id);
      onClose();
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-32"
  onclick={onClose}
  onkeydown={onKeydown}
  role="dialog"
  aria-label="Search threads"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="w-[32rem] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
    onclick={(e) => e.stopPropagation()}
    data-testid="search-overlay"
  >
    <input
      bind:this={inputEl}
      bind:value={query}
      class="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
      placeholder="Search threads…"
      data-testid="search-input"
    />
    <div class="max-h-80 overflow-y-auto py-1">
      {#each matches as thread, i (thread.id)}
        <button
          class="flex w-full items-baseline gap-2 px-4 py-1.5 text-left text-sm
            {i === index ? 'bg-surface-2' : ''} hover:bg-surface-2"
          onclick={() => {
            onSelect(thread.id);
            onClose();
          }}
        >
          <span class="truncate text-fg">{thread.title}</span>
          <span class="ml-auto shrink-0 text-xs text-faint">{projectName(thread.projectId)}</span>
        </button>
      {:else}
        <p class="px-4 py-3 text-xs text-fainter">No matches.</p>
      {/each}
    </div>
  </div>
</div>
