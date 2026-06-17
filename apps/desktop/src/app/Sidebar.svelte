<script lang="ts">
  import type { AppView, Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { playButtonSecondary } from "../lib/sound/button-click-sound";
  import SnoozePicker from "./SnoozePicker.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import MovingHighlight from "./MovingHighlight.svelte";
  import Tooltip from "./Tooltip.svelte";
  import Search from "@lucide/svelte/icons/search";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import Bot from "@lucide/svelte/icons/bot";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Settings from "@lucide/svelte/icons/settings";
  import Clock from "@lucide/svelte/icons/clock";
  import Check from "@lucide/svelte/icons/check";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import DoneBurst from "./DoneBurst.svelte";
  import { doneAnim } from "../lib/done-anim.svelte";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import SquarePen from "@lucide/svelte/icons/square-pen";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { TAG_META } from "../lib/tag-meta";

  let {
    width = 280,
    projects,
    threads,
    selectedThreadId,
    activeView,
    collapsedProjects = [],
    onSelect,
    onNewThread,
    onNewChat,
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
    onNewThread: (projectId: string, worktree?: boolean) => void;
    onNewChat: () => void;
    onOpenView: (view: AppView) => void;
    onOpenSearch: () => void;
  } = $props();

  let expanded = $state<Record<string, boolean>>({});
  let snoozePickerFor = $state<string | null>(null);
  let doneAnimFor = $state<string | null>(null);

  // ⌘⇧↑/↓ traversal: while the modifiers are held the highlight "hovers"
  // a thread without selecting it; releasing ⌘ or ⇧ "clicks" the previewed
  // row. `previewThreadId` is the hovered (not yet committed) thread.
  let previewThreadId = $state<string | null>(null);

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

  // Flat, top-to-bottom order of the rows ⌘⇧↑/↓ can land on: every visible
  // active row (project threads first, then chats). Collapsed groups
  // (snoozed/to-test/past) are intentionally excluded.
  const previewOrder = $derived([
    ...byProject.filter((g) => !isCollapsed(g.project.id)).flatMap((g) => g.active),
    ...chatGroups.active,
  ].map((t) => t.id));

  const previewSelector = $derived(
    previewThreadId ? `.session-row[data-thread-id="${previewThreadId}"]` : "",
  );

  function movePreview(dir: 1 | -1) {
    const list = previewOrder;
    if (list.length === 0) return;
    const cur = previewThreadId ?? selectedThreadId;
    let idx = cur ? list.indexOf(cur) : -1;
    if (idx === -1) idx = dir === 1 ? -1 : 0;
    idx = (idx + dir + list.length) % list.length;
    previewThreadId = list[idx]!;
    // Keep the previewed row on screen as the highlight travels.
    requestAnimationFrame(() => {
      document
        .querySelector(`.session-row[data-thread-id="${previewThreadId}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function onPreviewKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      movePreview(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      movePreview(-1);
    }
  }

  function onPreviewKeyup(e: KeyboardEvent) {
    if (previewThreadId === null) return;
    // Releasing either modifier commits the preview — "let go" = click.
    if (e.key === "Meta" || e.key === "Control" || e.key === "Shift") {
      const id = previewThreadId;
      previewThreadId = null;
      onSelect(id);
    }
  }

  function toggle(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] };
  }

  function newThread(projectId: string, worktree = false) {
    playButtonSecondary("click");
    onNewThread(projectId, worktree);
  }

  function newChat() {
    playButtonSecondary("click");
    onNewChat();
  }

  function removeProject(project: Project) {
    // projects:remove cascades to all the project's threads (ON DELETE CASCADE).
    if (!confirm(`Remove project "${project.name}" and all its threads?`)) return;
    api.invoke("projects:remove", project.id);
  }

  // Reversible thread actions show an undo toast (inverse IPC channel).
  // Marking Done plays the burst first; finishArchive runs the real archive
  // once the animation reports back so the row survives the effect.
  function archiveThread(thread: Thread) {
    doneAnimFor = thread.id;
  }
  function finishArchive(thread: Thread) {
    if (doneAnimFor === thread.id) doneAnimFor = null;
    // Pick the next thread below before this one leaves the list, so the
    // view advances instead of landing on nothing.
    const idx = previewOrder.indexOf(thread.id);
    const nextId = idx !== -1 ? (previewOrder[idx + 1] ?? previewOrder[idx - 1] ?? null) : null;
    void api.invoke("threads:archive", thread.id);
    if (nextId && thread.id === selectedThreadId) onSelect(nextId);
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
  {@const isActive = activeView === "thread" && selectedThreadId === thread.id}
  {@const Tag = TAG_META[thread.tag ?? "other"]}
  <div class="group relative flex items-center">
    {#if doneAnimFor === thread.id}
      <DoneBurst ondone={() => finishArchive(thread)} />
    {/if}
    <button
      class="session-row flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-1.5 text-left text-[13px]
        {isActive ? 'session-row--active text-fg' : 'text-muted hover:text-fg'}"
      class:done-pop={doneAnimFor === thread.id}
      class:done-pop--popSpark={doneAnimFor === thread.id && doneAnim.current === "popSpark"}
      class:done-pop--stamp={doneAnimFor === thread.id && doneAnim.current === "stamp"}
      class:done-pop--confetti={doneAnimFor === thread.id && doneAnim.current === "confetti"}
      class:done-pop--twos={doneAnimFor === thread.id && doneAnim.current === "twos"}
      class:done-pop--spring={doneAnimFor === thread.id && doneAnim.current === "spring"}
      data-thread-id={thread.id}
      onclick={() => onSelect(thread.id)}
    >
      <Tag.icon
        size={13}
        class="shrink-0 {thread.status === 'completed'
          ? 'text-accent'
          : thread.status === 'failed'
            ? 'text-danger'
            : 'text-faint'}"
        title={thread.status === "failed" ? "Failed" : Tag.label}
      />
      <span
        class="truncate {variant === 'archived'
          ? 'text-fainter'
          : thread.status === 'completed' && !isActive
            ? 'text-accent'
            : ''}">{thread.title}</span>
      {#if variant === "snoozed" && thread.snoozedUntil}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{snoozeTimeLeft(thread.snoozedUntil)}</span>
      {:else if thread.status === "running"}
        <BrailleSpinner class="session-spinner ml-auto mr-1 shrink-0" title="Thinking…" />
      {:else if variant === "active"}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{relativeTime(thread.lastActivityAt, now)}</span>
      {/if}
    </button>
    <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-surface group-hover:flex">
      {#if variant === "active"}
        <Tooltip text="Snooze">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            onclick={() => (snoozePickerFor = snoozePickerFor === thread.id ? null : thread.id)}
          ><Clock size={14} /></button>
        </Tooltip>
        <Tooltip text="Mark to test">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            onclick={() => markThreadToTest(thread)}
          ><Eye size={14} /></button>
        </Tooltip>
        <Tooltip text="Done">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            onclick={() => archiveThread(thread)}
          ><Check size={14} /></button>
        </Tooltip>
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
      <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active">
        {#each list as thread (thread.id)}
          {@render threadRow(thread, variant)}
        {/each}
      </MovingHighlight>
    {/if}
  {/if}
{/snippet}

<svelte:window
  onkeydown={onPreviewKeydown}
  onkeyup={onPreviewKeyup}
  onblur={() => (previewThreadId = null)}
/>

<aside
  class="flex h-full shrink-0 flex-col rounded-r-3xl bg-sidebar shadow-[inset_-5px_0_8px_-8px_rgba(0,0,0,0.1)]"
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
  <nav class="px-3 pb-2">
    <MovingHighlight
      class="flex flex-col gap-0.5"
      itemSelector=".main-nav-item"
      activeSelector=".main-nav-item--active"
    >
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'testing' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("testing")}
        data-testid="nav-testing"
      >
        <span class="flex items-center gap-2.5"><Eye size={15} /> Testing {#if toTestCount > 0}<span class="ml-1 rounded-full bg-surface-2 px-1.5 text-[10px]">{toTestCount}</span>{/if}</span>
        <kbd class="text-[10px] text-fainter">⇧6</kbd>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'automations' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("automations")}
        data-testid="nav-automations"
      >
        <span class="flex items-center gap-2.5"><AlarmClock size={15} /> Automations</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'agents' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("agents")}
        data-testid="nav-agents"
      >
        <span class="flex items-center gap-2.5"><Bot size={15} /> Agents</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'skills' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("skills")}
        data-testid="nav-skills"
      >
        <span class="flex items-center gap-2.5"><BookOpen size={15} /> Skills</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'extensions' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("extensions")}
        data-testid="nav-extensions"
      >
        <span class="flex items-center gap-2.5"><Puzzle size={15} /> Extensions</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'settings' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("settings")}
        data-testid="nav-settings"
      >
        <span class="flex items-center gap-2.5"><Settings size={15} /> Settings</span>
      </button>
    </MovingHighlight>
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
          <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
            {#each group.active as thread (thread.id)}
              {@render threadRow(thread, "active")}
            {/each}
          </MovingHighlight>
          {@render collapsible(`sn:${group.project.id}`, "Snoozed", group.snoozed, "snoozed")}
          {@render collapsible(`tt:${group.project.id}`, "To test", group.toTest, "toTest")}
          {@render collapsible(`ar:${group.project.id}`, "Done", group.archived, "archived")}
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
      <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
        {#each chatGroups.active as thread (thread.id)}
          {@render threadRow(thread, "active")}
        {/each}
      </MovingHighlight>
      {@render collapsible("chats:past", "Done", chatGroups.archived, "archived")}
    </div>
  </div>
</aside>

<style>
  /* ── per-variant card pop (hero motion) ────────────────────────── */
  :global(.session-row.done-pop) { transform-origin: center; }

  /* v1 Pop & sparkle — on-twos stepped, anticipation -> stretch -> settle */
  :global(.session-row.done-pop--popSpark) { animation: pop-spark 420ms steps(1, jump-end); }
  @keyframes pop-spark {
    0%   { transform: scale(1)    rotate(0);     }
    15%  { transform: scale(0.92) rotate(0);     }
    35%  { transform: scale(1.08) rotate(-2deg); }
    55%  { transform: scale(0.97) rotate(1.5deg);}
    75%  { transform: scale(1.03) rotate(-0.5deg);}
    100% { transform: scale(1)    rotate(0);     }
  }

  /* v2 Approval stamp — hard slam in, stepped */
  :global(.session-row.done-pop--stamp) { animation: pop-stamp 380ms steps(1, jump-end); }
  @keyframes pop-stamp {
    0%   { transform: scale(1.3) rotate(-4deg); }
    35%  { transform: scale(0.9) rotate(1deg);   }
    60%  { transform: scale(1.06) rotate(-1deg); }
    100% { transform: scale(1)    rotate(0);     }
  }

  /* v3 Confetti — bouncy smooth back-ease overshoot */
  :global(.session-row.done-pop--confetti) { animation: pop-confetti 460ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes pop-confetti {
    0%   { transform: scale(1);    }
    40%  { transform: scale(1.12); }
    70%  { transform: scale(0.97); }
    100% { transform: scale(1);    }
  }

  /* v4 Full on-twos — same stepped pop as v1 (burst itself is also stepped) */
  :global(.session-row.done-pop--twos) { animation: pop-spark 420ms steps(1, jump-end); }

  /* v5 Springy ring — smooth multi-overshoot spring */
  :global(.session-row.done-pop--spring) { animation: pop-spring 620ms cubic-bezier(0.5, 1.4, 0.5, 1); }
  @keyframes pop-spring {
    0%   { transform: scale(1);    }
    25%  { transform: scale(1.1);  }
    45%  { transform: scale(0.96); }
    65%  { transform: scale(1.04); }
    82%  { transform: scale(0.99); }
    100% { transform: scale(1);    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.session-row.done-pop) { animation: none !important; }
  }
</style>
