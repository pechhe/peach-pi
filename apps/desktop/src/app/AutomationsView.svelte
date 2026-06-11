<script lang="ts">
  import type { Automation, AutomationRun, Project } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";

  let {
    projects,
    automations,
    onSelectThread,
  }: {
    projects: Project[];
    automations: Automation[];
    onSelectThread: (threadId: string) => void;
  } = $props();

  const PRESETS = [
    { label: "Every hour", expression: "0 * * * *" },
    { label: "Every morning (9:00)", expression: "0 9 * * *" },
    { label: "Weekdays at 9:00", expression: "0 9 * * 1-5" },
    { label: "Every Monday (9:00)", expression: "0 9 * * 1" },
    { label: "Every 15 minutes", expression: "*/15 * * * *" },
  ];

  let creating = $state(false);
  let name = $state("");
  let cron = $state("0 9 * * *");
  let projectId = $state<string>("");
  let prompt = $state("");
  let nextPreview = $state<string | null>(null);
  let createError = $state("");
  let runsFor = $state<string | null>(null);
  let runs = $state<AutomationRun[]>([]);

  $effect(() => {
    const expr = cron;
    void api.invoke("automations:previewNext", expr).then((next) => {
      if (cron === expr) nextPreview = next;
    });
  });

  const fmt = (iso: string | undefined | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "?");

  async function create() {
    createError = "";
    try {
      await api.invoke("automations:create", {
        name: name.trim(),
        cron: cron.trim(),
        projectId: projectId || null,
        prompt: prompt.trim(),
      });
      playButtonClick("click");
      creating = false;
      name = prompt = "";
    } catch (err) {
      createError = String(err);
    }
  }

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
    <h1 class="text-sm font-medium text-zinc-300">Automations</h1>
    <button
      class="rounded-lg bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-900"
      onclick={() => (creating = !creating)}
      data-testid="new-automation">{creating ? "Cancel" : "New"}</button
    >
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-2xl flex-col gap-3">
      {#if creating}
        <div class="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-4" data-testid="automation-form">
          <input
            class="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            placeholder="Name (e.g. Morning triage)"
            bind:value={name}
          />
          <div class="flex gap-2">
            <select
              class="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none"
              onchange={(e) => e.currentTarget.value && (cron = e.currentTarget.value)}
            >
              <option value="">Preset…</option>
              {#each PRESETS as p (p.expression)}
                <option value={p.expression}>{p.label}</option>
              {/each}
            </select>
            <input
              class="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-sm outline-none focus:border-zinc-500"
              placeholder="cron (m h dom mon dow)"
              bind:value={cron}
            />
            <select
              class="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none"
              bind:value={projectId}
            >
              <option value="">New chat</option>
              {#each projects as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
          <textarea
            class="min-h-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            placeholder="Prompt to run"
            bind:value={prompt}
          ></textarea>
          <div class="flex items-center justify-between">
            <span class="text-xs {nextPreview ? 'text-zinc-500' : 'text-red-400'}">
              {nextPreview ? `Next run: ${fmt(nextPreview)}` : "Invalid cron expression"}
            </span>
            <button
              class="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-30"
              disabled={!name.trim() || !prompt.trim() || !nextPreview}
              onclick={create}
              data-testid="create-automation">Create</button
            >
          </div>
          {#if createError}<p class="text-xs text-red-400">{createError}</p>{/if}
        </div>
      {/if}

      {#each automations as auto (auto.id)}
        <div class="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div class="flex items-center gap-3">
            <button
              class="relative h-4 w-7 shrink-0 rounded-full transition-colors {auto.enabled ? 'bg-emerald-600' : 'bg-zinc-700'}"
              onclick={() => api.invoke("automations:setEnabled", auto.id, !auto.enabled)}
              aria-label="Toggle automation"
              role="switch"
              aria-checked={auto.enabled}
            >
              <span
                class="absolute top-0.5 size-3 rounded-full bg-white transition-transform {auto.enabled
                  ? 'translate-x-[0.85rem]'
                  : 'translate-x-0.5'}"
              ></span>
            </button>
            <div class="min-w-0 flex-1">
              <span class="block truncate text-sm text-zinc-200">{auto.name}</span>
              <span class="text-xs text-zinc-500">
                <span class="font-mono">{auto.cron}</span>
                · {projectName(auto.projectId)}
                · next {auto.enabled ? fmt(auto.nextFireAt) : "paused"}
              </span>
            </div>
            <button
              class="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onclick={() => api.invoke("automations:runNow", auto.id)}>Run now</button
            >
            <button
              class="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onclick={() => toggleRuns(auto.id)}>History</button
            >
            <button
              class="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              onclick={() => api.invoke("automations:delete", auto.id)}>✕</button
            >
          </div>
          <p class="mt-1.5 line-clamp-2 text-xs whitespace-pre-wrap text-zinc-500">{auto.prompt}</p>
          {#if runsFor === auto.id}
            <div class="mt-2 border-t border-zinc-800 pt-2">
              {#each runs as run (run.id)}
                <div class="flex items-center justify-between py-0.5 text-xs">
                  <span class="text-zinc-500">{fmt(run.firedAt)}</span>
                  {#if run.threadId}
                    <button
                      class="text-zinc-400 hover:text-zinc-100"
                      onclick={() => onSelectThread(run.threadId!)}>Open thread →</button
                    >
                  {:else}
                    <span class="text-red-400">failed</span>
                  {/if}
                </div>
              {:else}
                <p class="text-xs text-zinc-600">No runs yet.</p>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        {#if !creating}
          <p class="mt-8 text-center text-sm text-zinc-600">
            No automations. Schedule a recurring prompt — it fires into a fresh thread.
          </p>
        {/if}
      {/each}
    </div>
  </div>
</main>
