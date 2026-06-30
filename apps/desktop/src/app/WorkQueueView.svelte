<script lang="ts">
  import type { Project, AutomationModel, ThinkingLevel, ScopedModel } from "@peach-pi/shared-types";
  import { groupWorkQueue } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { workQueue } from "../stores/work-queue.svelte";
  import { mergeQueue } from "../stores/merge-queue.svelte";
  import { Select } from "../components/ui/select";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Play from "@lucide/svelte/icons/play";
  import GitMerge from "@lucide/svelte/icons/git-merge";

  let {
    projects,
    projectId,
  }: {
    projects: Project[];
    projectId: string | null;
  } = $props();

  const project = $derived(projectId ? (projects.find((p) => p.id === projectId) ?? null) : null);

  let launching = $state<number | null>(null);
  let launchingPrd = $state<number | null>(null);
  let launchingBreakdown = $state<number | null>(null);
  let launchingPrdAgent = $state<number | null>(null);
  let launchError = $state("");
  const busy = $derived(
    launching !== null ||
      launchingPrd !== null ||
      launchingBreakdown !== null ||
      launchingPrdAgent !== null ||
      launchingAll,
  );

  async function startAgent(issueNumber: number) {
    if (!projectId || busy) return;
    launching = issueNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:startAgent", projectId, issueNumber);
      if (res.ok) {
        await workQueue.load(projectId);
      } else {
        launchError = `Couldn’t start #${issueNumber} (${res.reason}${res.message ? `: ${res.message}` : ""})`;
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
      if (!res.ok) launchError = `Couldn’t start ready issues (${res.reason}${res.message ? `: ${res.message}` : ""})`;
      await workQueue.load(projectId);
    } finally {
      launchingPrd = null;
    }
  }

  async function breakdownPrd(prdNumber: number) {
    if (!projectId || busy) return;
    launchingBreakdown = prdNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:breakdownPrd", projectId, prdNumber);
      if (!res.ok) {
        launchError = `Couldn’t break down #${prdNumber} (${res.reason}${res.message ? `: ${res.message}` : ""})`;
      }
      await workQueue.load(projectId);
    } finally {
      launchingBreakdown = null;
    }
  }

  async function startPrdAgent(prdNumber: number) {
    if (!projectId || busy) return;
    launchingPrdAgent = prdNumber;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:startPrdAgent", projectId, prdNumber);
      if (!res.ok) {
        launchError = `Couldn’t start PRD #${prdNumber} (${res.reason}${res.message ? `: ${res.message}` : ""})`;
      }
      await workQueue.load(projectId);
    } finally {
      launchingPrdAgent = null;
    }
  }

  let launchingAll = $state(false);
  const allReady = $derived(
    (result?.ok ? result.issues : []).filter((i) => i.status === "ready" && !i.inProgress),
  );

  async function startAllGlobal() {
    if (!projectId || busy || launchingAll) return;
    launchingAll = true;
    launchError = "";
    try {
      const res = await api.invoke("workQueue:startAllReadyGlobal", projectId);
      if (!res.ok) launchError = `Couldn’t start ready issues (${res.reason}${res.message ? `: ${res.message}` : ""})`;
      await workQueue.load(projectId);
    } finally {
      launchingAll = false;
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
      if (!res.ok) launchError = `Couldn’t close #${issueNumber} (${res.reason}${res.message ? `: ${res.message}` : ""})`;
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
      if (!res.ok) launchError = `Couldn’t reopen #${issueNumber} (${res.reason}${res.message ? `: ${res.message}` : ""})`;
      await workQueue.load(projectId);
    } finally {
      closing = null;
    }
  }

  const groupHasReady = (g: { issues: { status: string; inProgress: boolean }[] }) =>
    g.issues.some((i) => i.status === "ready" && !i.inProgress);

  // ── Merge Queue selection mode ────────────────────────────────────
  // When on, each issue with an open PR shows a checkbox. The bottom action
  // bar runs `workQueue:mergeBatch` on the selected issues in selection order.
  let mergeMode = $state(false);
  let selected = $state<number[]>([]);
  // Merge-eligible = has an open PR and isn't done. NOT gated on
  // `inProgress` (worktree exists): the worktree is exactly what
  // `workQueue:mergeBatch` needs to rebase/test/merge, so an issue whose
  // agent finished but left its worktree around is still mergeable.
  // Local workflow has no PR signal — a ready/not-done issue with a worktree
  // is mergeable; the handler fails loudly per-item if none exists.
  const mergeEligible = (i: { hasOpenPr: boolean; status: string; inProgress: boolean }) =>
    workflow === "local"
      ? i.status !== "done" && i.status !== "blocked"
      : i.hasOpenPr && i.status !== "done";

  function toggleSelect(issueNumber: number) {
    selected = selected.includes(issueNumber)
      ? selected.filter((n) => n !== issueNumber)
      : [...selected, issueNumber];
  }

  function enterMergeMode() {
    mergeMode = true;
    selected = [];
  }

  function exitMergeMode() {
    mergeMode = false;
    selected = [];
    mergeQueue.reset();
  }

  const batchRunning = $derived(mergeQueue.inProgress);

  async function runMerge() {
    if (!projectId || selected.length === 0 || batchRunning) return;
    const order = [...selected];
    await mergeQueue.run(projectId, order);
    // GitHub reports a just-merged issue as open for a beat; defer the reload
    // so the sidebar badge + Work Queue list reflect the new closed state.
    setTimeout(() => { void workQueue.load(projectId); }, 1500);
  }

  const workflow = $derived(project?.mergeWorkflow ?? "pr");
  async function setWorkflow(next: "pr" | "local") {
    if (!projectId || next === workflow) return;
    await api.invoke("projects:setMergeWorkflow", projectId, next);
    // The snapshot event will refresh `project` (and hence `workflow`).
  }

  // ── Work Queue agent model + reasoning overrides ───────────────────
  // Per-project pins applied to every agent launch from the Work Queue
  // (startAgent / startAllReady / startPrdAgent / breakdownPrd). Mirrors the
  // AutomationDialog model picker: same scoped-model list as the composer,
  // encoded `${provider}\t${id}`, "" = pi default. Reasoning is a compact
  // select (matching the Model select) — no live thread meta is available at
  // the header level, so the composer's dial isn't a fit here.
  const THINKING_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: "Default" },
    { value: "off", label: "Off" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Max" },
  ];
  // Scoped models read from THIS project's settings.json (project scope
  // overrides global) so the list matches pi's TUI `/model scope` and the
  // composer's thread-bound list. The global scopedModels store reads
  // process.cwd() and would show every model.
  let projectScopedModels = $state<ScopedModel[]>([]);
  const scopedModelList = $derived(projectScopedModels.filter((m) => m.scoped));
  const modelItems = $derived(
    scopedModelList.map((m) => ({
      value: `${m.provider}\t${m.id}`,
      label: m.name,
      group: m.provider,
    })),
  );
  const agentModelKey = $derived(
    project?.agentModel ? `${project.agentModel.provider}\t${project.agentModel.id}` : "",
  );
  const agentThinking = $derived(project?.agentThinking ?? "");
  let settingModel = $state(false);
  let settingThinking = $state(false);

  async function setAgentModel(key: string) {
    if (!projectId || settingModel) return;
    settingModel = true;
    try {
      const m = key
        ? scopedModelList.find((x) => `${x.provider}\t${x.id}` === key) ?? null
        : null;
      const model: AutomationModel | null = m
        ? { provider: m.provider, id: m.id, name: m.name }
        : null;
      await api.invoke("projects:setAgentModel", projectId, model);
    } finally {
      settingModel = false;
    }
  }

  async function setAgentThinking(value: string) {
    if (!projectId || settingThinking) return;
    settingThinking = true;
    try {
      const level = (value || null) as ThinkingLevel | null;
      await api.invoke("projects:setAgentThinking", projectId, level);
    } finally {
      settingThinking = false;
    }
  }

  // Reload whenever the viewed project changes.
  $effect(() => {
    void workQueue.load(projectId);
  });

  // Load the project-scoped model list whenever the viewed project changes.
  $effect(() => {
    const id = projectId;
    if (!id) {
      projectScopedModels = [];
      return;
    }
    void api.invoke("app:listScopedModelsForProject", id).then((models) => {
      if (projectId === id) projectScopedModels = models;
    });
  });

  const result = $derived(workQueue.result);
  const groups = $derived(result?.ok ? groupWorkQueue(result.issues) : []);

  // View filter: which issues to show. Persisted per-app (not per-project) — a
  // user's preferred lens (actionable vs full history) rarely changes by repo.
  // - all:    every issue (open + done) — full picture incl. shipped work.
  // - open:   non-done only — hides the closed/done backlog clutter.
  // - ready:  status === "ready" only — the actionable "what can I start now" view.
  type WqFilter = "all" | "open" | "ready";
  const WQ_FILTER_KEY = "peach-pi.wq.filter";
  function readFilter(): WqFilter {
    const v = localStorage.getItem(WQ_FILTER_KEY);
    return v === "all" || v === "ready" ? v : "open";
  }
  let filter = $state<WqFilter>(readFilter());
  function setFilter(next: WqFilter) {
    if (next === filter) return;
    filter = next;
    try { localStorage.setItem(WQ_FILTER_KEY, next); } catch { /* quota */ }
  }
  // Groups after applying the view filter. Empty groups (no surviving child)
  // are dropped so headers with nothing under them don't add noise.
  const filteredGroups = $derived(
    filter === "all"
      ? groups
      : groups
          .map((g) => ({
            ...g,
            issues: g.issues.filter((i) =>
              filter === "open" ? i.status !== "done" : i.status === "ready",
            ),
          }))
          .filter((g) => g.issues.length > 0),
  );
</script>

<main class="flex h-full flex-1 flex-col" data-testid="work-queue-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">
      Work Queue{#if project}<span class="text-faint"> · {project.name}</span>{/if}
    </h1>
    <div class="flex items-center gap-2">
      {#if allReady.length > 0}
        <button
          class="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-2 disabled:opacity-50 titlebar-no-drag"
          onclick={startAllGlobal}
          disabled={busy}
          data-testid="start-all-ready-global"
        >
          <Play size={12} />
          {launchingAll ? "Starting…" : `Start all ready (${allReady.length})`}
        </button>
      {/if}
      <button
        class="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-2 disabled:opacity-50 titlebar-no-drag"
        onclick={mergeMode ? exitMergeMode : enterMergeMode}
        disabled={batchRunning}
        data-testid="merge-mode-toggle"
      >
        <GitMerge size={12} />
        {mergeMode ? "Cancel" : "Merge queue"}
      </button>
      <div
        class="flex items-center rounded-md border border-border p-0.5 titlebar-no-drag"
        data-testid="wq-filter-toggle"
        role="group"
        aria-label="View filter"
      >
        <button
          class="rounded px-1.5 py-0.5 text-xs {filter === 'all' ? 'bg-surface-2 text-fg' : 'text-faint hover:text-fg'}"
          onclick={() => setFilter("all")}
          title="All issues (open + done)"
        >All</button>
        <button
          class="rounded px-1.5 py-0.5 text-xs {filter === 'open' ? 'bg-surface-2 text-fg' : 'text-faint hover:text-fg'}"
          onclick={() => setFilter("open")}
          title="Open issues only (hide done)"
        >Open</button>
        <button
          class="rounded px-1.5 py-0.5 text-xs {filter === 'ready' ? 'bg-surface-2 text-fg' : 'text-faint hover:text-fg'}"
          onclick={() => setFilter("ready")}
          title="Ready issues only (actionable start list)"
        >Ready</button>
      </div>
      <div
        class="flex items-center rounded-md border border-border p-0.5 titlebar-no-drag"
        data-testid="workflow-toggle"
        role="group"
        aria-label="Merge workflow"
      >
        <button
          class="rounded px-1.5 py-0.5 text-xs {workflow === 'pr' ? 'bg-surface-2 text-fg' : 'text-faint hover:text-fg'}"
          onclick={() => setWorkflow("pr")}
          disabled={batchRunning}
          title="Open a GitHub PR and squash-merge via gh"
        >PR</button>
        <button
          class="rounded px-1.5 py-0.5 text-xs {workflow === 'local' ? 'bg-surface-2 text-fg' : 'text-faint hover:text-fg'}"
          onclick={() => setWorkflow("local")}
          disabled={batchRunning}
          title="Merge the worktree branch into the default branch locally and push"
        >Local</button>
      </div>
      <div
        class="flex items-center gap-1.5 titlebar-no-drag"
        data-testid="agent-model-select"
        title="Model used when launching agents from the Work Queue"
      >
        <span class="text-xs text-faint">Model</span>
        <Select
          class="w-32 gap-1 rounded-md border-border bg-transparent px-2 py-0.5 text-xs hover:bg-surface-2"
          placeholder="Default"
          value={agentModelKey}
          items={[{ value: "", label: "Default" }, ...modelItems]}
          onValueChange={setAgentModel}
        />
      </div>
      <div
        class="flex items-center gap-1.5 titlebar-no-drag"
        data-testid="agent-thinking-select"
        title="Reasoning level used when launching agents from the Work Queue"
      >
        <span class="text-xs text-faint">Reasoning</span>
        <Select
          class="w-24 gap-1 rounded-md border-border bg-transparent px-2 py-0.5 text-xs hover:bg-surface-2"
          placeholder="Default"
          value={agentThinking}
          items={THINKING_OPTIONS}
          onValueChange={setAgentThinking}
        />
      </div>
      <button
        class="text-faint hover:text-fg"
        onclick={() => workQueue.load(projectId)}
        data-testid="work-queue-refresh"
        aria-label="Refresh issues"
        title="Refresh"
      >
        <RefreshCw size={14} class={workQueue.loading ? "animate-spin" : ""} />
      </button>
    </div>
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
      <p class="text-sm text-faint" data-testid="work-queue-empty">No issues.</p>
    {:else if filteredGroups.length === 0}
      <p class="text-sm text-faint" data-testid="work-queue-filter-empty">
        No {filter === "ready" ? "ready" : "open"} issues.
      </p>
    {:else}
      <div class="flex flex-col gap-5" data-testid="work-queue-list">
        {#each filteredGroups as group (group.prd ? `prd-${group.prd.number}` : "unparented")}
          <section data-testid="work-queue-group">
            <header class="mb-1.5 flex items-center gap-2">
              {#if group.prd}
                <span class="font-mono text-xs text-faint">#{group.prd.number}</span>
                <h2 class="text-[13px] font-medium text-fg-soft">{group.prd.title}</h2>
                <span class="num-badge">prd</span>
                {#if group.issues.length === 0}
                  <button
                    class="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-fg hover:bg-surface-2 disabled:opacity-50"
                    onclick={() => breakdownPrd(group.prd!.number)}
                    disabled={busy}
                    data-testid="breakdown-prd"
                    ><Play size={12} />
                    {launchingBreakdown === group.prd!.number ? "Breaking down…" : "Break down"}</button
                  >
                  <button
                    class="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-fg hover:bg-surface-2 disabled:opacity-50"
                    onclick={() => startPrdAgent(group.prd!.number)}
                    disabled={busy}
                    data-testid="start-prd-agent"
                    ><Play size={12} />
                    {launchingPrdAgent === group.prd!.number ? "Starting…" : "Start agent"}</button
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
                <details class="group relative ml-auto shrink-0">
                  <summary
                    class="flex size-6 cursor-pointer list-none items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-fg"
                    aria-label="PRD actions"
                    data-testid="prd-actions-menu"
                    >⋯</summary
                  >
                  <div
                    class="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-surface-2 py-1 text-xs shadow-lg"
                    data-testid="prd-actions-dropdown"
                  >
                    <button
                      class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                      onclick={async () => {
                        await closeIssue(group.prd!.number, "completed");
                        (document.activeElement as HTMLElement)?.blur?.();
                      }}
                      disabled={busyWithIssue(group.prd!.number)}
                      data-testid="close-prd-completed"
                      >Mark done (completed)</button
                    >
                    <button
                      class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                      onclick={async () => {
                        await closeIssue(group.prd!.number, "not_planned");
                        (document.activeElement as HTMLElement)?.blur?.();
                      }}
                      disabled={busyWithIssue(group.prd!.number)}
                      data-testid="close-prd-not-planned"
                      >Close (not planned)</button
                    >
                    <button
                      class="block w-full px-3 py-1.5 text-left text-fg hover:bg-surface"
                      onclick={async () => {
                        await reopenIssue(group.prd!.number);
                        (document.activeElement as HTMLElement)?.blur?.();
                      }}
                      disabled={busyWithIssue(group.prd!.number)}
                      data-testid="reopen-prd"
                      >Reopen</button
                    >
                  </div>
                </details>
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
                      {issue.status === 'blocked' ? 'opacity-50' : ''}
                      {issue.status === 'done' ? 'opacity-60' : ''}"
                    data-testid="work-queue-item"
                    data-status={issue.status}
                  >
                    {#if mergeMode}
                      <input
                        type="checkbox"
                        class="size-3.5 shrink-0 accent-fg"
                        checked={selected.includes(issue.number)}
                        disabled={!mergeEligible(issue) || batchRunning}
                        onchange={() => toggleSelect(issue.number)}
                        data-testid="merge-select"
                      />
                    {/if}
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
                    {:else if issue.status === "done"}
                      <span class="shrink-0 text-xs text-faint" data-testid="status-done">done</span>
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
                    {#if mergeQueue.byIssue.get(issue.number)}
                      {@const p = mergeQueue.byIssue.get(issue.number)!}
                      <span
                        class="shrink-0 text-xs {p.item.ok ? 'text-emerald-500' : 'text-amber-600'}"
                        data-testid="merge-status"
                        title={!p.item.ok ? p.item.error : undefined}
                      >
                        {#if p.item.ok}
                          merged ✓
                        {:else if p.phase === 'rebase'}
                          {!p.item.ok && p.item.error.includes('Rebase conflict') ? 'rebase conflict ⚠' : 'rebase stopped ⚠'}
                        {:else if p.phase === 'tests'}
                          tests failed ⚠
                        {:else}
                          merge failed ⚠
                        {/if}
                      </span>
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

    {#if mergeMode}
      <div
        class="sticky bottom-0 flex shrink-0 items-center justify-between border-t border-border bg-surface-2 px-6 py-3 titlebar-no-drag"
        data-testid="merge-action-bar"
      >
        <span class="text-xs text-fg-soft">
          {selected.length} selected · rebase → test → merge
          {workflow === "local" ? " locally via agent" : " on main"}
        </span>
        <button
          class="flex items-center gap-1 rounded-md bg-fg px-3 py-1.5 text-xs text-surface hover:bg-fg/90 disabled:opacity-50"
          onclick={runMerge}
          disabled={selected.length === 0 || batchRunning}
          data-testid="merge-batch-run"
        >
          <GitMerge size={12} />
          {batchRunning ? "Merging…" : `Merge ${selected.length} → ${workflow === "local" ? "default (local)" : "main"}`}
        </button>
      </div>
    {/if}
  </div>
</main>
