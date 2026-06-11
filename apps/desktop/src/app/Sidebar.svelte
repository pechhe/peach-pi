<script lang="ts">
  import type { Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let {
    projects,
    threads,
    selectedThreadId,
    onSelect,
  }: {
    projects: Project[];
    threads: Thread[];
    selectedThreadId: string | null;
    onSelect: (threadId: string) => void;
  } = $props();

  async function addProject() {
    await api.invoke("projects:pick");
  }

  async function newThread(projectId: string) {
    const thread = await api.invoke("threads:create", projectId);
    onSelect(thread.id);
  }

  function threadsFor(projectId: string): Thread[] {
    return threads.filter((t) => t.projectId === projectId && !t.archivedAt);
  }
</script>

<aside class="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/60">
  <div class="titlebar-drag h-12 shrink-0"></div>
  <div class="flex items-center justify-between px-3 pb-2">
    <span class="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Projects</span>
    <button
      class="rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      onclick={addProject}
      data-testid="add-project"
      title="Add project">+</button
    >
  </div>
  <nav class="flex-1 overflow-y-auto px-2 pb-4">
    {#each projects as project (project.id)}
      <div class="mb-3">
        <div class="group flex items-center justify-between px-1 py-0.5">
          <span class="truncate text-sm font-medium text-zinc-300">{project.name}</span>
          <button
            class="rounded px-1.5 text-sm text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
            onclick={() => newThread(project.id)}
            data-testid="new-thread"
            title="New thread">+</button
          >
        </div>
        {#each threadsFor(project.id) as thread (thread.id)}
          <button
            class="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm
              {selectedThreadId === thread.id
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
            onclick={() => onSelect(thread.id)}
          >
            {#if thread.status === "running"}
              <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-400"></span>
            {/if}
            <span class="truncate">{thread.title}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="px-2 text-xs text-zinc-600">No projects yet. Add one with +.</p>
    {/each}
  </nav>
</aside>
