<script lang="ts">
  import type { AppView, Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonSecondary } from "../lib/sound/button-click-sound";
  import SnoozePicker from "./SnoozePicker.svelte";
  import Search from "@lucide/svelte/icons/search";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import Bot from "@lucide/svelte/icons/bot";
  import Workflow from "@lucide/svelte/icons/workflow";
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
    projects,
    threads,
    selectedThreadId,
    activeView,
    onSelect,
    onOpenView,
    onOpenSearch,
  }: {
    projects: Project[];
    threads: Thread[];
    selectedThreadId: string | null;
    activeView: AppView;
    onSelect: (threadId: string) => void;
    onOpenView: (view: AppView) => void;
    onOpenSearch: () => void;
  } = $props();

  let expanded = $state<Record<string, boolean>>({});
  let snoozePickerFor = $state<string | null>(null);

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
      class="flex w-full items-center gap-2 truncate rounded-md px-2 py-[5px] text-left text-[13px]
        {selectedThreadId === thread.id
        ? 'bg-surface-2 text-fg shadow-sm shadow-black/20'
        : 'text-muted hover:bg-surface/80 hover:text-fg'}"
      onclick={() => onSelect(thread.id)}
    >
      {#if thread.status === "running"}
        <span class="relative size-1.5 shrink-0 rounded-full bg-success">
          <span class="absolute inset-0 animate-ping rounded-full bg-success/60"></span>
        </span>
      {:else if thread.status === "failed"}
        <span class="size-1.5 shrink-0 rounded-full bg-danger"></span>
      {/if}
      <span class="truncate {variant === 'archived' ? 'text-fainter' : ''}">{thread.title}</span>
      {#if variant === "snoozed" && thread.snoozedUntil}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{snoozeTimeLeft(thread.snoozedUntil)}</span>
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
          onclick={() => api.invoke("threads:markToTest", thread.id)}
        ><Eye size={14} /></button>
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Archive"
          onclick={() => api.invoke("threads:archive", thread.id)}
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
          void api.invoke("threads:snooze", thread.id, until);
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

<aside class="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg/60">
  <div class="titlebar-drag h-10 shrink-0"></div>

  <!-- Nav -->
  <nav class="flex flex-col gap-0.5 px-2 pb-2">
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px] text-muted hover:bg-surface hover:text-fg"
      onclick={onOpenSearch}
      data-testid="nav-search"
    >
      <span class="flex items-center gap-2"><Search size={15} /> Search</span><kbd class="text-[10px] text-fainter">⌘K</kbd>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'testing' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("testing")}
      data-testid="nav-testing"
    >
      <span class="flex items-center gap-2"><Eye size={15} /> Testing {#if toTestCount > 0}<span class="ml-1 rounded-full bg-surface-2 px-1.5 text-[10px]">{toTestCount}</span>{/if}</span>
      <kbd class="text-[10px] text-fainter">⇧6</kbd>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'automations' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("automations")}
      data-testid="nav-automations"
    >
      <span class="flex items-center gap-2"><AlarmClock size={15} /> Automations</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'agents' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("agents")}
      data-testid="nav-agents"
    >
      <span class="flex items-center gap-2"><Bot size={15} /> Agents</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'graph' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("graph")}
      data-testid="nav-graph"
    >
      <span class="flex items-center gap-2"><Workflow size={15} /> Graph</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'skills' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("skills")}
      data-testid="nav-skills"
    >
      <span class="flex items-center gap-2"><BookOpen size={15} /> Skills</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'extensions' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("extensions")}
      data-testid="nav-extensions"
    >
      <span class="flex items-center gap-2"><Puzzle size={15} /> Extensions</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2 py-[3px] text-[13px]
        {activeView === 'settings' ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'}"
      onclick={() => onOpenView("settings")}
      data-testid="nav-settings"
    >
      <span class="flex items-center gap-2"><Settings size={15} /> Settings</span>
    </button>
  </nav>

  <!-- Projects -->
  <div class="flex items-center justify-between px-3 pt-1 pb-1">
    <span class="text-xs font-semibold tracking-wide text-faint uppercase">Projects</span>
    <button
      class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
      onclick={() => api.invoke("projects:pick")}
      data-testid="add-project"
      title="Add project"><Plus size={15} /></button
    >
  </div>
  <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    {#each byProject as group (group.project.id)}
      <div class="mb-3">
        <div class="group flex items-center justify-between px-1 py-0.5">
          <span class="truncate text-sm font-medium text-fg-soft">{group.project.name}</span>
          <button
            class="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-fg"
            onclick={() => newThread(group.project.id)}
            data-testid="new-thread"
            title="Add thread"
            aria-label="Add thread"><Plus size={14} /></button
          >
          <button
            class="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-fg"
            onclick={() => newThread(group.project.id, true)}
            data-testid="new-worktree-thread"
            title="New worktree thread (isolated checkout)"><GitBranchPlus size={14} /></button
          >
        </div>
        {#each group.active as thread (thread.id)}
          {@render threadRow(thread, "active")}
        {/each}
        {@render collapsible(`sn:${group.project.id}`, "Snoozed", group.snoozed, "snoozed")}
        {@render collapsible(`tt:${group.project.id}`, "To test", group.toTest, "toTest")}
        {@render collapsible(`ar:${group.project.id}`, "Past", group.archived, "archived")}
      </div>
    {:else}
      <p class="px-2 text-xs text-fainter">No projects yet. Add one with +.</p>
    {/each}
  </nav>

  <!-- Chats -->
  <div class="border-t border-border px-2 pt-2 pb-3">
    <div class="flex items-center justify-between px-1 pb-1">
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
