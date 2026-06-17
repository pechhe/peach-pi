<script lang="ts">
  import type { Project, Thread, ThreadSearchHit } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let {
    projects,
    threads,
    onSelect,
    onClose,
  }: {
    projects: Project[];
    threads: Thread[];
    /** `findQuery` is passed when a body match was clicked — ThreadView will
     *  open its FindBar pre-filled with the original search term. */
    onSelect: (threadId: string, findQuery?: string) => void;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let loading = $state(false);

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "");

  /** Empty query → recent threads (title only). Typed query → full-text hits
   *  from `threads:search` (titles + bodies, bodies carry a snippet). */
  let hits = $state<ThreadSearchHit[]>([]);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function runSearch(q: string): Promise<void> {
    const trimmed = q.trim();
    if (!trimmed) {
      // Recent threads: derive hits client-side, no snippet.
      hits = threads
        .filter((t) => !t.archivedAt)
        .slice(0, 10)
        .map((t) => ({ threadId: t.id, title: t.title, projectName: projectName(t.projectId) }));
      loading = false;
      return;
    }
    try {
      hits = await api.invoke("threads:search", trimmed);
    } catch {
      hits = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Debounce so we don't scan every JSONL on each keystroke.
    const q = query;
    loading = q.trim().length > 0;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runSearch(q);
    }, 200);
  });

  $effect(() => {
    void hits;
    index = 0;
  });
  $effect(() => {
    inputEl?.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % Math.max(1, hits.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + hits.length) % Math.max(1, hits.length);
    }
    const hit = hits[index];
    if (e.key === "Enter" && hit) {
      onSelect(hit.threadId);
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
      placeholder="Search threads and messages…"
      data-testid="search-input"
    />
    <div class="max-h-80 overflow-y-auto py-1">
      {#each hits as hit, i (hit.threadId)}
        <button
          class="flex w-full flex-col gap-0.5 px-4 py-1.5 text-left text-sm
            {i === index ? 'bg-surface-2' : ''} hover:bg-surface-2"
          onclick={() => {
            onSelect(hit.threadId, hit.snippet ? query.trim() : undefined);
            onClose();
          }}
        >
          <div class="flex items-baseline gap-2">
            <span class="truncate text-fg">{hit.title}</span>
            <span class="ml-auto shrink-0 text-xs text-faint">{hit.projectName || "Chat"}</span>
          </div>
          {#if hit.snippet}
            <span class="line-clamp-2 text-xs text-fainter">{hit.snippet}</span>
          {/if}
        </button>
      {:else}
        <p class="px-4 py-3 text-xs text-fainter">
          {loading ? "Searching…" : "No matches."}
        </p>
      {/each}
    </div>
  </div>
</div>
