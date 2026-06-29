<script lang="ts">
  import type { Automation, AutomationRun, Project } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Pencil from "@lucide/svelte/icons/pencil";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import Monitor from "@lucide/svelte/icons/monitor";
  import CalendarClock from "@lucide/svelte/icons/calendar-clock";
  import Play from "@lucide/svelte/icons/play";
  import History from "@lucide/svelte/icons/history";
  import MoreVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import Target from "@lucide/svelte/icons/target";
  import FileText from "@lucide/svelte/icons/file-text";
  import Timer from "@lucide/svelte/icons/timer";
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

  let editing = $state<Automation | null>(null);
  let runsFor = $state<string | null>(null);
  let runs = $state<AutomationRun[]>([]);

  let dialogOpen = $state(false);
  // When the dialog closes (Cancel/Save set open=false via the binding),
  // drop the edit target so the next "New" starts fresh.
  $effect(() => {
    if (!dialogOpen) editing = null;
  });

  let menuFor = $state<string | null>(null);

  function closeMenu(e: MouseEvent) {
    if (menuFor === null) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("[data-automation-menu]")) return;
    menuFor = null;
  }

  function editAutomation(auto: Automation) {
    menuFor = null;
    editing = auto;
    dialogOpen = true;
  }

  const fmt = (iso: string | undefined | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "?");

  async function toggleRuns(id: string) {
    menuFor = null;
    if (runsFor === id) {
      runsFor = null;
      return;
    }
    runs = await api.invoke("automations:runs", id);
    runsFor = id;
  }
</script>

<svelte:window onclick={closeMenu} />

<main class="flex h-full flex-1 flex-col" data-testid="automations-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">Automations</h1>
    <button
      class="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-fg"
      onclick={() => {
        editing = null;
        dialogOpen = true;
      }}
      data-testid="new-automation">New</button
    >
  </header>

  <AutomationDialog bind:open={dialogOpen} {projects} automation={editing} />

  <!-- Toolbar: filter tabs + search -->
  <div class="flex items-center gap-2 px-6 pb-3">
    <div class="flex items-center gap-1">
      {#each tabs as t (t.id)}
        <button
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors {tab ===
          t.id
            ? "bg-primary text-primary-fg"
            : "text-muted hover:bg-surface-2 hover:text-fg"}"
          onclick={() => (tab = t.id)}>
          {t.label}
          <span
            class="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] {tab ===
            t.id
              ? "bg-primary-fg/20 text-primary-fg"
              : "bg-surface-2 text-faint"}">{counts[t.id]}</span
          >
        </button>
      {/each}
    </div>
    <div class="relative ml-auto w-64">
      <Search
        size={14}
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        type="text"
        placeholder="Search automations..."
        bind:value={query}
        class="w-full rounded-lg border border-border bg-surface/50 py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fainter focus:border-primary focus:outline-none" />
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-2xl flex-col gap-2.5">
      {#each filtered as auto (auto.id)}
        <div
          class="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
          <Switch
            checked={auto.enabled}
            onCheckedChange={() => api.invoke("automations:setEnabled", auto.id, !auto.enabled)}
            aria-label="Toggle automation" />

          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true">
            <CalendarClock size={18} />
          </div>

          <div class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-fg">{auto.name}</span>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
              <span class="inline-flex items-center gap-1">
                <Timer size={12} />{cronLabel(auto.cron)}
              </span>
              <span class="inline-flex items-center gap-1">
                <Target size={12} />{projectName(auto.projectId)}
              </span>
              {#if auto.projectId}
                <span class="inline-flex items-center gap-1">
                  {#if auto.environment === "worktree"}
                    <GitBranchPlus size={12} />Worktree
                  {:else}
                    <Monitor size={12} />Local
                  {/if}
                </span>
              {/if}
              {#if auto.model}
                <span class="inline-flex items-center gap-1">
                  <FileText size={12} />{auto.model.name}
                </span>
              {/if}
            </div>
            {#if auto.prompt}
              <p class="mt-1 line-clamp-1 truncate font-mono text-xs text-muted">
                {auto.prompt}
              </p>
            {/if}
          </div>

          <div class="hidden shrink-0 flex-col items-end sm:flex">
            <span class="text-[10px] uppercase tracking-wide text-fainter">Next run</span>
            <span class="text-xs font-medium text-fg-soft">
              {auto.enabled ? fmt(auto.nextFireAt) : "Paused"}
            </span>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <button
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              onclick={() => api.invoke("automations:runNow", auto.id)}>
              <Play size={13} />Run now
            </button>
            <button
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              onclick={() => toggleRuns(auto.id)}>
              <History size={13} />History
            </button>
            <div class="relative" data-automation-menu>
              <button
                class="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-fg"
                aria-label="Automation menu"
                onclick={() => (menuFor = menuFor === auto.id ? null : auto.id)}>
                <MoreVertical size={15} />
              </button>
              {#if menuFor === auto.id}
                <div
                  class="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
                  <button
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-surface-2"
                    onclick={() => editAutomation(auto)}>
                    <Pencil size={12} />Edit
                  </button>
                  <button
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-surface-2"
                    onclick={() => {
                      menuFor = null;
                      api.invoke("automations:delete", auto.id);
                    }}>
                    <Trash2 size={12} />Delete
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>

        {#if runsFor === auto.id}
          <div class="ml-12 mb-1 rounded-lg border border-border bg-surface/40 px-4 py-2">
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
      {:else}
        <p class="mt-8 text-center text-sm text-fainter">
          {query || tab !== "all"
            ? "No automations match these filters."
            : "No automations. Schedule a recurring prompt — it fires into a fresh thread."}
        </p>
      {/each}
    </div>
  </div>
</main>
