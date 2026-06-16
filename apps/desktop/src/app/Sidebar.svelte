<script lang="ts">
  import type { AppView, Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { playButtonSecondary } from "../lib/sound/button-click-sound";
  import SnoozePicker from "./SnoozePicker.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import Search from "@lucide/svelte/icons/search";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import Bot from "@lucide/svelte/icons/bot";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Settings from "@lucide/svelte/icons/settings";
  import Clock from "@lucide/svelte/icons/clock";
  import Archive from "@lucide/svelte/icons/archive";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import SquarePen from "@lucide/svelte/icons/square-pen";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    width = 280,
    projects,
    threads,
    selectedThreadId,
    activeView,
    collapsedProjects = [],
    onSelect,
    onOpenView,
    onOpenSearch,
  }: {
    width?: number;
    projects: Project[];
    threads: Thread[];
    selectedThreadId: string | null;
    activeView: AppView;
    collapsedProjects?: string[];
    onSelect: (threadId: string) => void;
    onOpenView: (view: AppView) => void;
    onOpenSearch: () => void;
  } = $props();

  let expanded = $state<Record<string, boolean>>({});
  let snoozePickerFor = $state<string | null>(null);

  // Sidebar drag-reorder of projects (native HTML5 DnD).
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  function isCollapsed(projectId: string): boolean {
    return collapsedProjects.includes(projectId);
  }
  function toggleCollapse(project: Project) {
    api.invoke("projects:setCollapsed", project.id, !isCollapsed(project.id));
  }
  function onProjectDragStart(project: Project, e: DragEvent) {
    draggedId = project.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", project.id);
    }
  }
  function onProjectDragOver(project: Project, e: DragEvent) {
    if (!draggedId || draggedId === project.id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverId = project.id;
  }
  function onProjectDrop(project: Project, e: DragEvent) {
    e.preventDefault();
    if (draggedId && draggedId !== project.id) {
      const ids = projects.map((p) => p.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(project.id);
      if (from !== -1 && to !== -1) {
        const next = ids.slice();
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        api.invoke("projects:reorder", next);
      }
    }
    draggedId = null;
    dragOverId = null;
  }
  function onProjectDragEnd() {
    draggedId = null;
    dragOverId = null;
  }

  // Re-tick so relative timestamps stay fresh without a reload.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  function relativeTime(iso: string, ref: number): string {
    const m = Math.floor((ref - new Date(iso).getTime()) / 60_000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  const toTestCount = $derived(threads.filter((t) => t.toTestAt && !t.archivedAt).length);
  const chats = $derived(threads.filter((t) => t.projectId === null));

  function partition(list: Thread[]) {
    return {
      active: list.filter((t) => !t.archivedAt && !t.snoozedUntil && !t.toTestAt),
      snoozed: list.filter((t) => !t.archivedAt && t.snoozedUntil),
      toTest: list.filter((t) => !t.archivedAt && !t.snoozedUntil && t.toTestAt),
      archived: list.filter((t) => t.archivedAt),
    };
  }

  const byProject = $derived(
    projects.map((p) => ({ project: p, ...partition(threads.filter((t) => t.projectId === p.id)) })),
  );
  const chatGroups = $derived(partition(chats));

  function toggle(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] };
  }

  async function newThread(projectId: string, worktree = false) {
    playButtonSecondary("click");
    const thread = await api.invoke("threads:create", projectId, { worktree });
    onSelect(thread.id);
  }

  async function newChat() {
    playButtonSecondary("click");
    const thread = await api.invoke("threads:createChat");
    onSelect(thread.id);
  }

  function removeProject(project: Project) {
    // projects:remove cascades to all the project's threads (ON DELETE CASCADE).
    if (!confirm(`Remove project "${project.name}" and all its threads?`)) return;
    api.invoke("projects:remove", project.id);
  }

  // Reversible thread actions show an undo toast (inverse IPC channel).
  function archiveThread(thread: Thread) {
    void api.invoke("threads:archive", thread.id);
    extensionUi.notify(`Archived “${thread.title || "Untitled"}”`, {
      label: "Undo",
      run: () => void api.invoke("threads:unarchive", thread.id),
    });
  }
  function markThreadToTest(thread: Thread) {
    void api.invoke("threads:markToTest", thread.id);
    extensionUi.notify(`Moved “${thread.title || "Untitled"}” to testing`, {
      label: "Undo",
      run: () => void api.invoke("threads:unmarkToTest", thread.id),
    });
  }
  function snoozeThread(thread: Thread, until: string) {
    void api.invoke("threads:snooze", thread.id, until);
    extensionUi.notify(`Snoozed “${thread.title || "Untitled"}”`, {
      label: "Undo",
      run: () => void api.invoke("threads:unsnooze", thread.id),
    });
  }

  function snoozeTimeLeft(until: string): string {
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) return "soon";
    const h = Math.floor(ms / 3_600_000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${Math.max(1, h)}h`;
  }
</script>

{#snippet threadRow(thread: Thread, variant: "active" | "snoozed" | "toTest" | "archived")}
  <div class="group relative flex items-center">
    <button
      class="flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-1.5 text-left text-[13px]
        {selectedThreadId === thread.id
        ? 'bg-surface-2 text-fg shadow-sm shadow-black/20'
        : 'text-muted hover:bg-surface/80 hover:text-fg'}"
      onclick={() => onSelect(thread.id)}
    >
      {#if thread.status === "running"}
        <BrailleSpinner class="session-spinner shrink-0" title="Thinking…" />
      {:else if thread.status === "failed"}
        <span class="size-1.5 shrink-0 rounded-full bg-danger"></span>
      {:else if thread.status === "completed"}
        <span class="size-1.5 shrink-0 rounded-full bg-accent" title="Finished"></span>
      {/if}
      <span
        class="truncate {variant === 'archived'
          ? 'text-fainter'
          : thread.status === 'completed' && selectedThreadId !== thread.id
            ? 'text-accent'
            : ''}">{thread.title}</span>
      {#if variant === "snoozed" && thread.snoozedUntil}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{snoozeTimeLeft(thread.snoozedUntil)}</span>
      {:else if variant === "active"}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{relativeTime(thread.lastActivityAt, now)}</span>
      {/if}
    </button>
    <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-surface group-hover:flex">
      {#if variant === "active"}
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Snooze"
          onclick={() => (snoozePickerFor = snoozePickerFor === thread.id ? null : thread.id)}
        ><Clock size={14} /></button>
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Mark to test"
          onclick={() => markThreadToTest(thread)}
        ><Eye size={14} /></button>
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Archive"
          onclick={() => archiveThread(thread)}
        ><Archive size={14} /></button>
      {:else if variant === "snoozed"}
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Unsnooze"
          onclick={() => api.invoke("threads:unsnooze", thread.id)}
        ><AlarmClock size={14} /></button>
      {:else if variant === "toTest"}
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Unmark"
          onclick={() => api.invoke("threads:unmarkToTest", thread.id)}
        ><EyeOff size={14} /></button>
      {:else}
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Restore"
          onclick={() => api.invoke("threads:unarchive", thread.id)}
        ><ArchiveRestore size={14} /></button>
        <button
          class="rounded p-1 text-faint hover:text-danger"
          title="Delete forever"
          onclick={() => api.invoke("threads:delete", thread.id)}
        ><Trash2 size={14} /></button>
      {/if}
    </div>
    {#if snoozePickerFor === thread.id}
      <SnoozePicker
        onPick={(until) => {
          snoozePickerFor = null;
          snoozeThread(thread, until);
        }}
        onClose={() => (snoozePickerFor = null)}
      />
    {/if}
  </div>
{/snippet}

{#snippet collapsible(key: string, label: string, list: Thread[], variant: "snoozed" | "toTest" | "archived")}
  {#if list.length > 0}
    <button
      class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] text-fainter hover:text-muted"
      onclick={() => toggle(key)}
    >
      {#if expanded[key]}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
      {label} · {list.length}
    </button>
    {#if expanded[key]}
      {#each list as thread (thread.id)}
        {@render threadRow(thread, variant)}
      {/each}
    {/if}
  {/if}
{/snippet}

<aside
  class="flex h-full shrink-0 flex-col rounded-r-xl bg-sidebar"
  style="width: {width}px"
>
  <div class="titlebar-drag h-10 shrink-0"></div>

  <!-- Search: a distinct, input-like component raised above the nav. -->
  <div class="px-3 pb-2">
    <button
      class="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-muted shadow-sm shadow-black/5 hover:border-border-strong hover:text-fg"
      onclick={onOpenSearch}
      data-testid="nav-search"
    >
      <span class="flex items-center gap-2.5"><Search size={15} /> Search</span><kbd class="text-[10px] text-fainter">⌘K</kbd>
    </button>
  </div>

  <!-- Nav -->
  <nav class="flex flex-col gap-0.5 px-3 pb-2">
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'testing' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("testing")}
      data-testid="nav-testing"
    >
      <span class="flex items-center gap-2.5"><Eye size={15} /> Testing {#if toTestCount > 0}<span class="ml-1 rounded-full bg-surface-2 px-1.5 text-[10px]">{toTestCount}</span>{/if}</span>
      <kbd class="text-[10px] text-fainter">⇧6</kbd>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'automations' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("automations")}
      data-testid="nav-automations"
    >
      <span class="flex items-center gap-2.5"><AlarmClock size={15} /> Automations</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'agents' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("agents")}
      data-testid="nav-agents"
    >
      <span class="flex items-center gap-2.5"><Bot size={15} /> Agents</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'skills' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("skills")}
      data-testid="nav-skills"
    >
      <span class="flex items-center gap-2.5"><BookOpen size={15} /> Skills</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'extensions' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("extensions")}
      data-testid="nav-extensions"
    >
      <span class="flex items-center gap-2.5"><Puzzle size={15} /> Extensions</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'settings' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("settings")}
      data-testid="nav-settings"
    >
      <span class="flex items-center gap-2.5"><Settings size={15} /> Settings</span>
    </button>
  </nav>

  <!-- Projects -->
  <div class="flex items-center justify-between px-4 pt-2 pb-1.5">
    <span class="text-xs font-semibold tracking-wide text-faint uppercase">Projects</span>
    <button
      class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
      onclick={() => api.invoke("projects:pick")}
      data-testid="add-project"
      title="Add project"><Plus size={15} /></button
    >
  </div>
  <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
    {#each byProject as group (group.project.id)}
      <div class="mb-3">
        <div
          class="group flex items-center justify-between rounded-md px-1 py-0.5
            {draggedId === group.project.id ? 'opacity-40' : ''}
            {dragOverId === group.project.id && draggedId && draggedId !== group.project.id
              ? 'bg-surface-2 ring-1 ring-inset ring-accent/50'
              : ''}"
          draggable="true"
          ondragstart={(e) => onProjectDragStart(group.project, e)}
          ondragover={(e) => onProjectDragOver(group.project, e)}
          ondrop={(e) => onProjectDrop(group.project, e)}
          ondragend={onProjectDragEnd}
          ondragleave={() => { if (dragOverId === group.project.id) dragOverId = null; }}
          data-testid="project-row"
        >
          <button
            class="flex min-w-0 flex-1 items-center gap-1 rounded p-0.5 text-left cursor-grab active:cursor-grabbing"
            onclick={() => toggleCollapse(group.project)}
            title={isCollapsed(group.project.id) ? "Expand" : "Collapse"}
            aria-label={isCollapsed(group.project.id) ? "Expand project" : "Collapse project"}
            aria-expanded={!isCollapsed(group.project.id)}
            data-testid="toggle-project"
          >
            {#if isCollapsed(group.project.id)}
              <ChevronRight size={14} class="shrink-0 text-faint" />
            {:else}
              <ChevronDown size={14} class="shrink-0 text-faint" />
            {/if}
            <span class="truncate text-sm font-medium text-fg-soft">{group.project.name}</span>
            {#if isCollapsed(group.project.id)}
              {@const total = group.active.length + group.snoozed.length + group.toTest.length + group.archived.length}
              {#if total > 0}
                <span class="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] text-fainter">{total}</span>
              {/if}
            {/if}
          </button>
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
              onclick={() => newThread(group.project.id)}
              data-testid="new-thread"
              title="Add thread"
              aria-label="Add thread"><Plus size={14} /></button
            >
            <button
              class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
              onclick={() => newThread(group.project.id, true)}
              data-testid="new-worktree-thread"
              title="New worktree thread (isolated checkout)"><GitBranchPlus size={14} /></button
            >
            <button
              class="rounded p-1 text-faint hover:bg-surface-2 hover:text-danger"
              onclick={() => removeProject(group.project)}
              data-testid="remove-project"
              title="Remove project"
              aria-label="Remove project"><Trash2 size={14} /></button
            >
          </div>
        </div>
        {#if !isCollapsed(group.project.id)}
          {#each group.active as thread (thread.id)}
            {@render threadRow(thread, "active")}
          {/each}
          {@render collapsible(`sn:${group.project.id}`, "Snoozed", group.snoozed, "snoozed")}
          {@render collapsible(`tt:${group.project.id}`, "To test", group.toTest, "toTest")}
          {@render collapsible(`ar:${group.project.id}`, "Past", group.archived, "archived")}
        {/if}
      </div>
    {:else}
      <p class="px-2 text-xs text-fainter">No projects yet. Add one with +.</p>
    {/each}
  </nav>

  <!-- Chats -->
  <div class="border-t border-border/60 px-3 pt-3 pb-3">
    <div class="flex items-center justify-between px-1 pb-1.5">
      <span class="text-xs font-semibold tracking-wide text-faint uppercase">Chats</span>
      <button
        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
        onclick={newChat}
        data-testid="new-chat"
        title="New chat"><SquarePen size={14} /></button
      >
    </div>
    <div class="max-h-48 overflow-y-auto">
      {#each chatGroups.active as thread (thread.id)}
        {@render threadRow(thread, "active")}
      {/each}
      {@render collapsible("chats:past", "Past", chatGroups.archived, "archived")}
    </div>
  </div>
</aside>
