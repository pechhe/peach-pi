<script lang="ts">
  import type { Automation, AutomationRun, Project } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import Monitor from "@lucide/svelte/icons/monitor";
  import AutomationDialog from "./AutomationDialog.svelte";
  import { cronLabel } from "../lib/automations/schedule";
  import { Switch } from "../components/ui/switch";

  let {
    projects,
    automations,
    onSelectThread,
  }: {
    projects: Project[];
    automations: Automation[];
    onSelectThread: (threadId: string) => void;
  } = $props();

  let creating = $state(false);
  let runsFor = $state<string | null>(null);
  let runs = $state<AutomationRun[]>([]);

  const fmt = (iso: string | undefined | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "?");

  async function toggleRuns(id: string) {
    if (runsFor === id) {
      runsFor = null;
      return;
    }
    runs = await api.invoke("automations:runs", id);
    runsFor = id;
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="automations-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">Automations</h1>
    <button
      class="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-fg"
      onclick={() => (creating = true)}
      data-testid="new-automation">New</button
    >
  </header>

  <AutomationDialog bind:open={creating} {projects} />

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-2xl flex-col gap-3">
      {#each automations as auto (auto.id)}
        <div class="rounded-lg border border-border bg-surface/50 px-4 py-3">
          <div class="flex items-center gap-3">
            <Switch
              checked={auto.enabled}
              onCheckedChange={() => api.invoke("automations:setEnabled", auto.id, !auto.enabled)}
              aria-label="Toggle automation"
            />
            <div class="min-w-0 flex-1">
              <span class="block truncate text-sm text-fg">{auto.name}</span>
              <span class="flex items-center gap-1 text-xs text-faint">
                <span>{cronLabel(auto.cron)}</span>
                · {projectName(auto.projectId)}
                {#if auto.projectId}
                  · <span class="inline-flex items-center gap-0.5">
                    {#if auto.environment === "worktree"}<GitBranchPlus size={11} /> worktree{:else}<Monitor size={11} /> local{/if}
                  </span>
                {/if}
                · next {auto.enabled ? fmt(auto.nextFireAt) : "paused"}
              </span>
            </div>
            <button
              class="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              onclick={() => api.invoke("automations:runNow", auto.id)}>Run now</button
            >
            <button
              class="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              onclick={() => toggleRuns(auto.id)}>History</button
            >
            <button
              class="rounded p-1.5 text-faint hover:bg-surface-2 hover:text-danger"
              onclick={() => api.invoke("automations:delete", auto.id)}><Trash2 size={14} /></button
            >
          </div>
          <p class="mt-1.5 line-clamp-2 text-xs whitespace-pre-wrap text-faint">{auto.prompt}</p>
          {#if runsFor === auto.id}
            <div class="mt-2 border-t border-border pt-2">
              {#each runs as run (run.id)}
                <div class="flex items-center justify-between py-0.5 text-xs">
                  <span class="text-faint">{fmt(run.firedAt)}</span>
                  {#if run.threadId}
                    <button
                      class="text-muted hover:text-fg"
                      onclick={() => onSelectThread(run.threadId!)}>Open thread →</button
                    >
                  {:else}
                    <span class="text-danger">failed</span>
                  {/if}
                </div>
              {:else}
                <p class="text-xs text-fainter">No runs yet.</p>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <p class="mt-8 text-center text-sm text-fainter">
          No automations. Schedule a recurring prompt — it fires into a fresh thread.
        </p>
      {/each}
    </div>
  </div>
</main>
