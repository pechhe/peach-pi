<script lang="ts">
  import type { Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

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
</script>

<main class="flex h-full flex-1 flex-col" data-testid="testing-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
    <h1 class="text-sm font-medium text-zinc-300">To test · {toTest.length}</h1>
  </header>
  <div class="flex-1 overflow-y-auto px-6 pb-6">
    {#if toTest.length === 0}
      <div class="flex h-full items-center justify-center">
        <p class="text-sm text-zinc-600">
          Nothing marked for testing. Use 👁 on a thread when its work needs a manual check.
        </p>
      </div>
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-2">
        {#each toTest as thread (thread.id)}
          <div class="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <button class="flex-1 truncate text-left" onclick={() => onSelect(thread.id)}>
              <span class="block truncate text-sm text-zinc-200">{thread.title}</span>
              <span class="text-xs text-zinc-500">
                {projectName(thread.projectId)}
                {#if thread.toTestNote}· {thread.toTestNote}{/if}
              </span>
            </button>
            <button
              class="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onclick={() => api.invoke("threads:unmarkToTest", thread.id)}>Done</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>
