<script lang="ts">
  import type { AppView, Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonSecondary } from "../lib/sound/button-click-sound";
  import SnoozePicker from "./SnoozePicker.svelte";

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
      class="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm
        {selectedThreadId === thread.id
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onSelect(thread.id)}
    >
      {#if thread.status === "running"}
        <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-400"></span>
      {/if}
      <span class="truncate {variant === 'archived' ? 'text-zinc-600' : ''}">{thread.title}</span>
      {#if variant === "snoozed" && thread.snoozedUntil}
        <span class="ml-auto shrink-0 text-[10px] text-zinc-600">{snoozeTimeLeft(thread.snoozedUntil)}</span>
      {/if}
    </button>
    <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-zinc-900 group-hover:flex">
      {#if variant === "active"}
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Snooze"
          onclick={() => (snoozePickerFor = snoozePickerFor === thread.id ? null : thread.id)}
        >💤</button>
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Mark to test"
          onclick={() => api.invoke("threads:markToTest", thread.id)}
        >👁</button>
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Archive"
          onclick={() => api.invoke("threads:archive", thread.id)}
        >🗄</button>
      {:else if variant === "snoozed"}
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Unsnooze"
          onclick={() => api.invoke("threads:unsnooze", thread.id)}
        >⏰</button>
      {:else if variant === "toTest"}
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Unmark"
          onclick={() => api.invoke("threads:unmarkToTest", thread.id)}
        >✓</button>
      {:else}
        <button
          class="rounded p-1 text-zinc-500 hover:text-zinc-200"
          title="Restore"
          onclick={() => api.invoke("threads:unarchive", thread.id)}
        >↩</button>
        <button
          class="rounded p-1 text-zinc-500 hover:text-red-400"
          title="Delete forever"
          onclick={() => api.invoke("threads:delete", thread.id)}
        >🗑</button>
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
      class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] text-zinc-600 hover:text-zinc-400"
      onclick={() => toggle(key)}
    >
      <span class="text-[9px]">{expanded[key] ? "▼" : "▶"}</span>
      {label} · {list.length}
    </button>
    {#if expanded[key]}
      {#each list as thread (thread.id)}
        {@render threadRow(thread, variant)}
      {/each}
    {/if}
  {/if}
{/snippet}

<aside class="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/60">
  <div class="titlebar-drag h-10 shrink-0"></div>

  <!-- Nav -->
  <nav class="flex flex-col gap-0.5 px-2 pb-2">
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      onclick={onOpenSearch}
      data-testid="nav-search"
    >
      <span>🔍 Search</span><kbd class="text-[10px] text-zinc-600">⌘K</kbd>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'testing' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("testing")}
      data-testid="nav-testing"
    >
      <span>👁 Testing {#if toTestCount > 0}<span class="ml-1 rounded-full bg-zinc-800 px-1.5 text-[10px]">{toTestCount}</span>{/if}</span>
      <kbd class="text-[10px] text-zinc-600">⇧6</kbd>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'automations' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("automations")}
      data-testid="nav-automations"
    >
      <span>⏰ Automations</span>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'agents' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("agents")}
      data-testid="nav-agents"
    >
      <span>🤖 Agents</span>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'graph' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("graph")}
      data-testid="nav-graph"
    >
      <span>🕸 Graph</span>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'skills' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("skills")}
      data-testid="nav-skills"
    >
      <span>📚 Skills</span>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'extensions' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("extensions")}
      data-testid="nav-extensions"
    >
      <span>🧩 Extensions</span>
    </button>
    <button
      class="flex items-center justify-between rounded px-2 py-1 text-sm
        {activeView === 'settings' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}"
      onclick={() => onOpenView("settings")}
      data-testid="nav-settings"
    >
      <span>⚙︎ Settings</span>
    </button>
  </nav>

  <!-- Projects -->
  <div class="flex items-center justify-between px-3 pt-1 pb-1">
    <span class="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Projects</span>
    <button
      class="rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      onclick={() => api.invoke("projects:pick")}
      data-testid="add-project"
      title="Add project">+</button
    >
  </div>
  <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    {#each byProject as group (group.project.id)}
      <div class="mb-3">
        <div class="group flex items-center justify-between px-1 py-0.5">
          <span class="truncate text-sm font-medium text-zinc-300">{group.project.name}</span>
          <button
            class="rounded px-1.5 text-sm text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
            onclick={() => newThread(group.project.id)}
            data-testid="new-thread"
            title="New thread">+</button
          >
          <button
            class="rounded px-1 font-mono text-[11px] text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
            onclick={() => newThread(group.project.id, true)}
            data-testid="new-worktree-thread"
            title="New worktree thread (isolated checkout)">⎇+</button
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
      <p class="px-2 text-xs text-zinc-600">No projects yet. Add one with +.</p>
    {/each}
  </nav>

  <!-- Chats -->
  <div class="border-t border-zinc-800 px-2 pt-2 pb-3">
    <div class="flex items-center justify-between px-1 pb-1">
      <span class="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Chats</span>
      <button
        class="rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        onclick={newChat}
        data-testid="new-chat"
        title="New chat">✎</button
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
