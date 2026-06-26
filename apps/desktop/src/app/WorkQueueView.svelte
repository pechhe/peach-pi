<script lang="ts">
  import type { Project } from "@peach-pi/shared-types";
  import { groupWorkQueue } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { workQueue } from "../stores/work-queue.svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Play from "@lucide/svelte/icons/play";

  let {
    projects,
    projectId,
    onLaunched,
  }: {
    projects: Project[];
    projectId: string | null;
    onLaunched: (threadId: string) => void;
  } = $props();

  const project = $derived(projectId ? (projects.find((p) => p.id === projectId) ?? null) : null);

  let launching = $state<number | null>(null);
  let launchingPrd = $state<number | null>(null);
  let launchError = $state("");
  const busy = $derived(launching !== null || launchingPrd !== null);

  async function startAgent(issueNumber: number) {
    if (!projectId || busy) return;
    launching = issueNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:startAgent", projectId, issueNumber);
      if (res.ok) {
        await workQueue.load(projectId);
        onLaunched(res.threadId);
      } else {
        launchError = `Couldn’t start #${issueNumber} (${res.reason})`;
        await workQueue.load(projectId);
      }
    } finally {
      launching = null;
    }
  }

  async function startAllReady(prdNumber: number) {
    if (!projectId || busy) return;
    launchingPrd = prdNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:startAllReady", projectId, prdNumber);
      if (!res.ok) launchError = `Couldn’t start ready issues (${res.reason})`;
      await workQueue.load(projectId);
    } finally {
      launchingPrd = null;
    }
  }

  let closing = $state<number | null>(null);
  const busyWithIssue = (n: number) => launching === n || closing === n;

  async function closeIssue(issueNumber: number, reason: "completed" | "not_planned") {
    if (!projectId) return;
    closing = issueNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:closeIssue", projectId, issueNumber, reason);
      if (!res.ok) launchError = `Couldn’t close #${issueNumber} (${res.reason})`;
      await workQueue.load(projectId);
    } finally {
      closing = null;
    }
  }

  async function reopenIssue(issueNumber: number) {
    if (!projectId) return;
    closing = issueNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:reopenIssue", projectId, issueNumber);
      if (!res.ok) launchError = `Couldn’t reopen #${issueNumber} (${res.reason})`;
      await workQueue.load(projectId);
    } finally {
      closing = null;
    }
  }

  const groupHasReady = (g: { issues: { status: string; inProgress: boolean }[] }) =>
    g.issues.some((i) => i.status === "ready" && !i.inProgress);

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
    {#if launchError}
      <p class="mb-2 text-xs text-red-500" data-testid="work-queue-launch-error">{launchError}</p>
    {/if}
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
                {#if groupHasReady(group)}
                  <button
                    class="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-fg hover:bg-surface-2 disabled:opacity-50"
                    onclick={() => startAllReady(group.prd!.number)}
                    disabled={busy}
                    data-testid="start-all-ready"
                    ><Play size={12} />
                    {launchingPrd === group.prd!.number ? "Starting…" : "Start all ready"}</button
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
                    {#if issue.inProgress}
                      <span class="shrink-0 text-xs text-faint" data-testid="status-in-progress"
                        >in progress</span
                      >
                    {:else if issue.status === "ready"}
                      <button
                        class="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-fg hover:bg-surface-2 disabled:opacity-50"
                        onclick={() => startAgent(issue.number)}
                        disabled={busy}
                        data-testid="start-agent"
                        ><Play size={12} /> {launching === issue.number ? "Starting…" : "Start agent"}</button
                      >
                    {:else if issue.status === "blocked"}
                      <span class="shrink-0 text-xs text-faint" data-testid="status-blocked"
                        >blocked by {issue.unmetBlockers.map((n) => `#${n}`).join(", ")}</span
                      >
                    {/if}
                    <details class="group relative shrink-0">
                      <summary
                        class="flex size-6 cursor-pointer list-none items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-fg"
                        aria-label="_issue actions"
                        data-testid="issue-actions-menu"
                        >⋯</summary
                      >
                      <div
                        class="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-surface-2 py-1 text-xs shadow-lg"
                        data-testid="issue-actions-dropdown"
                      >
                        <button
                          class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                          onclick={async () => {
                            await closeIssue(issue.number, "completed");
                            (document.activeElement as HTMLElement)?.blur?.();
                          }}
                          disabled={busyWithIssue(issue.number)}
                          data-testid="close-completed"
                          >Mark done (completed)</button
                        >
                        <button
                          class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                          onclick={async () => {
                            await closeIssue(issue.number, "not_planned");
                            (document.activeElement as HTMLElement)?.blur?.();
                          }}
                          disabled={busyWithIssue(issue.number)}
                          data-testid="close-not-planned"
                          >Close (not planned)</button
                        >
                        <button
                          class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                          onclick={async () => {
                            await reopenIssue(issue.number);
                            (document.activeElement as HTMLElement)?.blur?.();
                          }}
                          disabled={busyWithIssue(issue.number)}
                          data-testid="reopen"
                          >Reopen</button
                        >
                      </div>
                    </details>
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
