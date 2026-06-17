<script lang="ts">
  import type { Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Eye from "@lucide/svelte/icons/eye";

  let {
    projects,
    threads,
    onSelect,
  }: {
    projects: Project[];
    threads: Thread[];
    onSelect: (threadId: string) => void;
  } = $props();

  const toTest = $derived(threads.filter((t) => t.toTestAt && !t.archivedAt));
  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "");

  // The runthrough reply is a one-row markdown table | Feature | Test |.
  // The model often emits it on a single line, so split on every pipe, then
  // drop empties, the |---| separator, and the header labels. What's left is
  // the single data row.
  function parseRunthrough(note: string | undefined): { feature: string; test: string } | undefined {
    if (!note) return undefined;
    const cells = note
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => {
        if (!cell) return false;
        if (/^:?-+:?$/.test(cell)) return false; // separator dashes
        if (/^(feature|test)$/i.test(cell)) return false; // header labels
        return true;
      });
    if (cells.length < 2) return undefined;
    return { feature: cells[0] ?? "", test: cells[1] ?? "" };
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="testing-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
    <h1 class="text-sm font-medium text-fg-soft">To test · {toTest.length}</h1>
  </header>
  <div class="flex-1 overflow-y-auto px-6 pb-6">
    {#if toTest.length === 0}
      <div class="flex h-full items-center justify-center">
        <p class="flex items-center gap-1.5 text-sm text-fainter">
          Nothing marked for testing. Use <Eye size={14} class="inline" /> on a thread when its work needs a manual check.
        </p>
      </div>
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-2">
        {#each toTest as thread (thread.id)}
          <div class="flex items-start gap-3 rounded-lg border border-border bg-surface/50 px-4 py-3">
            <button class="flex-1 min-w-0 text-left" onclick={() => onSelect(thread.id)}>
              <span class="block truncate text-sm text-fg">{thread.title}</span>
              <span class="block text-xs text-faint">{projectName(thread.projectId)}</span>
              {#if parseRunthrough(thread.toTestNote)}
                {@const row = parseRunthrough(thread.toTestNote)}
                <span class="mt-2 flex flex-col gap-1.5">
                  <span class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-fainter">Feature</span>
                    <span class="text-xs text-fg-soft">{row?.feature}</span>
                  </span>
                  <span class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-fainter">How to test</span>
                    <span class="text-xs text-fg-soft">{row?.test}</span>
                  </span>
                </span>
              {:else if thread.toTestNote}
                <span class="mt-1 block text-xs text-fg-soft">{thread.toTestNote}</span>
              {:else}
                <span class="mt-1 block text-xs italic text-fainter">Waiting for runthrough…</span>
              {/if}
            </button>
            <button
              class="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              onclick={() => api.invoke("threads:unmarkToTest", thread.id)}>Done</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>
