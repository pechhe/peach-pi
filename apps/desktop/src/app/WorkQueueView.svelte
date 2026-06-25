<script lang="ts">
  import type { Project } from "@peach-pi/shared-types";
  import { groupWorkQueue } from "@peach-pi/shared-types";
  import { workQueue } from "../stores/work-queue.svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  let {
    projects,
    projectId,
  }: {
    projects: Project[];
    projectId: string | null;
  } = $props();

  const project = $derived(projectId ? (projects.find((p) => p.id === projectId) ?? null) : null);

  // Load whenever the viewed project changes.
  $effect(() => {
    void workQueue.load(projectId);
  });

  const result = $derived(workQueue.result);
  const groups = $derived(result?.ok ? groupWorkQueue(result.issues) : []);
</script>

<main class="flex h-full flex-1 flex-col" data-testid="work-queue-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">
      Work Queue{#if project}<span class="text-faint"> · {project.name}</span>{/if}
    </h1>
    <button
      class="text-faint hover:text-fg"
      onclick={() => workQueue.load(projectId)}
      data-testid="work-queue-refresh"
      aria-label="Refresh issues"
      title="Refresh"
    >
      <RefreshCw size={14} class={workQueue.loading ? "animate-spin" : ""} />
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
    {#if workQueue.loading && !result}
      <p class="text-sm text-faint">Loading issues…</p>
    {:else if result && !result.ok}
      <p class="text-sm text-faint" data-testid="work-queue-placeholder">
        {#if result.reason === "no-remote"}
          This project has no <code>origin</code> remote, so there are no tracker issues to show.
        {:else if result.reason === "not-github"}
          Only GitHub remotes are supported right now.
        {:else}
          Couldn’t load issues{result.message ? `: ${result.message}` : ""}.
        {/if}
      </p>
    {:else if groups.length === 0}
      <p class="text-sm text-faint" data-testid="work-queue-empty">No open issues.</p>
    {:else}
      <div class="flex flex-col gap-5" data-testid="work-queue-list">
        {#each groups as group (group.prd ? `prd-${group.prd.number}` : "unparented")}
          <section data-testid="work-queue-group">
            <header class="mb-1.5 flex items-center gap-2">
              {#if group.prd}
                <span class="font-mono text-xs text-faint">#{group.prd.number}</span>
                <h2 class="text-[13px] font-medium text-fg-soft">{group.prd.title}</h2>
                <span class="num-badge">prd</span>
                {#if group.childless}
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600"
                    data-testid="prd-childless">needs breakdown</span
                  >
                {/if}
              {:else}
                <h2 class="text-[13px] font-medium text-fg-soft">Unparented</h2>
              {/if}
            </header>

            {#if group.issues.length === 0}
              <p class="pl-3 text-xs text-faint">No open child issues.</p>
            {:else}
              <ul class="flex flex-col gap-1">
                {#each group.issues as issue (issue.number)}
                  <li
                    class="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2
                      {issue.status === 'blocked' ? 'opacity-50' : ''}"
                    data-testid="work-queue-item"
                    data-status={issue.status}
                  >
                    <span class="shrink-0 font-mono text-xs text-faint">#{issue.number}</span>
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      class="min-w-0 flex-1 truncate text-[13px] text-fg hover:underline"
                      >{issue.title}</a
                    >
                    {#if issue.status === "ready"}
                      <span class="num-badge num-badge--accent" data-testid="status-ready"
                        >ready</span
                      >
                    {:else if issue.status === "blocked"}
                      <span class="shrink-0 text-xs text-faint" data-testid="status-blocked"
                        >blocked by {issue.unmetBlockers.map((n) => `#${n}`).join(", ")}</span
                      >
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </div>
</main>
