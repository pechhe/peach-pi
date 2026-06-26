<script lang="ts">
  import { Dialog } from "bits-ui";
  import type {
    Project,
    ReferencedConnection,
    Automation,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import { buildConnectionsHint } from "../lib/composer/hints";
  import { scopedModels } from "../stores/scoped-models.svelte";
  import {
    DEFAULT_SCHEDULE,
    scheduleToCron,
    automationScheduleLabel,
    cronToSchedule,
    type AutomationFrequency,
    type AutomationSchedule,
  } from "../lib/automations/schedule";
  import { Select } from "../components/ui/select";
  import AutomationPromptField from "./AutomationPromptField.svelte";
  import X from "@lucide/svelte/icons/x";
  import Monitor from "@lucide/svelte/icons/monitor";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";

  let {
    open = $bindable(false),
    projects,
    automation = null,
  }: {
    open?: boolean;
    projects: Project[];
    /** When set, the dialog edits this automation instead of creating a new one. */
    automation?: Automation | null;
  } = $props();

  const editing = $derived(automation != null);

  const FREQUENCIES: { value: AutomationFrequency; label: string }[] = [
    { value: "hourly", label: "Hourly" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];
  const WEEKDAYS = [
    { value: "1", label: "Mon" },
    { value: "2", label: "Tue" },
    { value: "3", label: "Wed" },
    { value: "4", label: "Thu" },
    { value: "5", label: "Fri" },
    { value: "6", label: "Sat" },
    { value: "0", label: "Sun" },
  ];

  let name = $state("");
  let prompt = $state("");
  let connections = $state<ReferencedConnection[]>([]);
  let projectId = $state("");
  let environment = $state<"local" | "worktree">("local");
  let frequency = $state<AutomationFrequency>(DEFAULT_SCHEDULE.frequency);
  let time = $state(DEFAULT_SCHEDULE.time);
  let dayOfWeek = $state(DEFAULT_SCHEDULE.dayOfWeek ?? 1);
  // Encoded model choice: `${provider}\t${id}`, or "" for pi's default.
  let modelKey = $state("");
  let nextPreview = $state<string | null>(null);
  let createError = $state("");

  const schedule = $derived<AutomationSchedule>({ frequency, time, dayOfWeek });
  const cron = $derived(scheduleToCron(schedule));
  const selectedProject = $derived(projects.find((p) => p.id === projectId) ?? null);
  // Worktrees require a real git repo; chats/folders can only run locally.
  const canWorktree = $derived(selectedProject?.kind === "repo");
  // Same scoped-model list the composer's empty slot shows
  // (app:listScopedModels filtered to scoped=true). Note: an empty scope is
  // special-cased by pi as "all models implicitly scoped" — the store surfaces
  // those as scoped=true too, so this filter is correct in both cases.
  const scopedModelList = $derived(scopedModels.models.filter((m) => m.scoped));
  const modelItems = $derived(
    scopedModelList.map((m) => ({
      value: `${m.provider}\t${m.id}`,
      label: m.name,
      group: m.provider,
    })),
  );
  const selectedModel = $derived(
    modelKey ? (scopedModelList.find((m) => `${m.provider}\t${m.id}` === modelKey) ?? null) : null,
  );
  const canCreate = $derived(
    name.trim().length > 0 && prompt.trim().length > 0 && Boolean(nextPreview),
  );

  // Populate the form each time the dialog opens: blank for new, prefilled
  // from `automation` for edit. We don't round-trip the @-connection hint back
  // out of the stored prompt — edits start from the raw stored prompt body.
  $effect(() => {
    if (open) {
      createError = "";
      // Ensure the scoped-models list is loaded (settings may never have
      // been opened) so the picker matches the composer's empty slot.
      void scopedModels.load();
      if (automation) {
        name = automation.name;
        prompt = automation.prompt;
        connections = [];
        projectId = automation.projectId ?? "";
        environment = automation.environment;
        const parsed = cronToSchedule(automation.cron);
        frequency = parsed?.frequency ?? DEFAULT_SCHEDULE.frequency;
        time = parsed?.time ?? DEFAULT_SCHEDULE.time;
        dayOfWeek = parsed?.dayOfWeek ?? DEFAULT_SCHEDULE.dayOfWeek ?? 1;
        modelKey = automation.model ? `${automation.model.provider}\t${automation.model.id}` : "";
      } else {
        name = "";
        prompt = "";
        connections = [];
        projectId = "";
        environment = "local";
        frequency = DEFAULT_SCHEDULE.frequency;
        time = DEFAULT_SCHEDULE.time;
        dayOfWeek = DEFAULT_SCHEDULE.dayOfWeek ?? 1;
        modelKey = "";
      }
    }
  });

  $effect(() => {
    const expr = cron;
    void api.invoke("automations:previewNext", expr).then((next) => {
      if (cron === expr) nextPreview = next;
    });
  });

  // Snap back to local whenever a worktree isn't valid for the selection.
  $effect(() => {
    if (!canWorktree && environment === "worktree") environment = "local";
  });

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "—";

  async function save() {
    createError = "";
    // Bake the @-connection hints into the stored prompt so the fired thread
    // prefers them (the engine sends the raw prompt verbatim). Appended after
    // the body so a leading `/skill` stays first and pi still expands it.
    const body = prompt.trim();
    const hint = buildConnectionsHint(connections);
    const finalPrompt = hint ? `${body}\n\n${hint}` : body;
    const fields = {
      name: name.trim(),
      cron,
      projectId: projectId || null,
      prompt: finalPrompt,
      environment,
      model: selectedModel
        ? { provider: selectedModel.provider, id: selectedModel.id, name: selectedModel.name }
        : null,
    };
    try {
      if (editing) {
        await api.invoke("automations:update", automation!.id, fields);
      } else {
        await api.invoke("automations:create", fields);
      }
      playButtonClick("click");
      open = false;
    } catch (err) {
      createError = String(err);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 flex w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      data-testid="automation-dialog"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <Dialog.Title class="text-sm font-semibold text-fg">{editing ? "Edit automation" : "New automation"}</Dialog.Title>
          <Dialog.Description class="mt-0.5 text-[12px] text-faint">
            Schedule a recurring prompt — it fires into a fresh thread.
          </Dialog.Description>
        </div>
        <Dialog.Close
          class="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X size={16} />
        </Dialog.Close>
      </div>

      <input
        class="rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-border-focus"
        placeholder="Automation title (e.g. Morning triage)"
        bind:value={name}
      />

      <AutomationPromptField
        bind:value={prompt}
        bind:connections
        projectId={projectId || null}
        placeholder="Prompt to run. Type / for skills, @ for connections."
      />

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <span class="text-[11px] font-medium uppercase tracking-wide text-fainter">Project</span>
          <Select
            placeholder="New chat"
            bind:value={projectId}
            items={[
              { value: "", label: "New chat" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-[11px] font-medium uppercase tracking-wide text-fainter">Runs in</span>
          <div
            class="flex items-center gap-1 rounded-lg border border-border-strong bg-bg p-1 {canWorktree
              ? ''
              : 'opacity-50'}"
          >
            <button
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors {environment ===
              'local'
                ? 'bg-surface-2 text-fg'
                : 'text-muted hover:text-fg'}"
              onclick={() => (environment = "local")}
            >
              <Monitor size={14} /> Local
            </button>
            <button
              type="button"
              disabled={!canWorktree}
              title={canWorktree
                ? "Run in a fresh isolated git worktree"
                : "Worktrees need a git repo project"}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors disabled:cursor-not-allowed {environment ===
              'worktree'
                ? 'bg-surface-2 text-fg'
                : 'text-muted hover:text-fg'}"
              onclick={() => canWorktree && (environment = "worktree")}
            >
              <GitBranchPlus size={14} /> Worktree
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium uppercase tracking-wide text-fainter">Model</span>
        <Select
          placeholder="Default (pi picks)"
          bind:value={modelKey}
          items={[
            { value: "", label: "Default" },
            ...modelItems,
          ]}
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium uppercase tracking-wide text-fainter">Schedule</span>
        <div class="flex items-center gap-1 rounded-lg border border-border-strong bg-bg p-1">
          {#each FREQUENCIES as f (f.value)}
            <button
              type="button"
              class="flex-1 rounded-md px-2 py-1 text-[13px] transition-colors {frequency === f.value
                ? 'bg-surface-2 text-fg'
                : 'text-muted hover:text-fg'}"
              onclick={() => (frequency = f.value)}>{f.label}</button
            >
          {/each}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {#if frequency === "weekly"}
            <Select
              class="w-28"
              value={String(dayOfWeek)}
              onValueChange={(v) => (dayOfWeek = Number(v))}
              items={WEEKDAYS}
            />
          {/if}
          {#if frequency !== "hourly"}
            <input
              type="time"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              bind:value={time}
            />
          {:else}
            <span class="text-[13px] text-faint">Runs at the top of every hour.</span>
          {/if}
        </div>

        <span class="text-[12px] {nextPreview ? 'text-faint' : 'text-danger'}">
          {nextPreview ? `${automationScheduleLabel(schedule)} · next ${fmt(nextPreview)}` : "Invalid schedule"}
        </span>
      </div>

      {#if createError}
        <p class="rounded-lg border border-danger-border/50 bg-danger-surface/20 px-3 py-2 text-[12px] text-danger">
          {createError}
        </p>
      {/if}

      <div class="flex justify-end gap-2">
        <Dialog.Close
          class="rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2"
        >
          Cancel
        </Dialog.Close>
        <button
          class="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-fg disabled:opacity-30"
          disabled={!canCreate}
          onclick={save}
          data-testid={editing ? "save-automation" : "create-automation"}>{editing ? "Save" : "Create"}</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
