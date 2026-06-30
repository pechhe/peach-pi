<script lang="ts">
  import type { AppView } from "@peach-pi/shared-types";
  import { api } from "../../lib/ipc";
  import { workQueue } from "../../stores/work-queue.svelte";
  import MovingHighlight from "../../app/MovingHighlight.svelte";
  import Tooltip from "../../app/Tooltip.svelte";
  import SnoozedPopover from "../../app/SnoozedPopover.svelte";
  import ThreadRow from "./ThreadRow.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import { sidebarStore, type ProjectListGroup } from "./sidebar.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Clock from "@lucide/svelte/icons/clock";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import Archive from "@lucide/svelte/icons/archive";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let {
    group,
    activeView,
    onOpenTesting,
    onOpenWorkQueue,
  }: {
    group: ProjectListGroup;
    activeView: AppView;
    onOpenTesting: (projectId: string) => void;
    onOpenWorkQueue: (projectId: string) => void;
  } = $props();

  const collapsed = $derived(sidebarStore.isCollapsed(group.project.id));
  const worktreeActiveTotal = $derived(
    group.worktreeFlatActive.length + group.worktreeNested.reduce((n, wg) => n + wg.active.length, 0),
  );
</script>

<div class="mb-3">
  <div
    class="group flex items-center justify-between rounded-md px-1 py-0.5
      {sidebarStore.draggedId === group.project.id ? 'opacity-40' : ''}
      {sidebarStore.dragOverId === group.project.id && sidebarStore.draggedId && sidebarStore.draggedId !== group.project.id
        ? 'bg-surface-2 ring-1 ring-inset ring-accent/50'
        : ''}"
    draggable="true"
    ondragstart={(e) => sidebarStore.onProjectDragStart(group.project, e)}
    ondragover={(e) => sidebarStore.onProjectDragOver(group.project, e)}
    ondrop={(e) => sidebarStore.onProjectDrop(group.project, e)}
    ondragend={() => sidebarStore.onProjectDragEnd()}
    ondragleave={() => { if (sidebarStore.dragOverId === group.project.id) sidebarStore.dragOverId = null; }}
    data-testid="project-row"
  >
    <button
      class="flex min-w-0 flex-1 items-center gap-1 rounded p-0.5 text-left cursor-grab active:cursor-grabbing"
      onclick={() => sidebarStore.toggleCollapse(group.project)}
      title={collapsed ? "Expand" : "Collapse"}
      aria-label={collapsed ? "Expand project" : "Collapse project"}
      aria-expanded={!collapsed}
      data-testid="toggle-project"
    >
      {#if collapsed}
        <ChevronRight size={14} class="shrink-0 text-faint" />
      {:else}
        <ChevronDown size={14} class="shrink-0 text-faint" />
      {/if}
      <span class="truncate text-sm font-medium text-fg-soft">{group.project.name}</span>
    </button>
    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
      <Tooltip text="Add thread to master">
        <button
          class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
          onclick={() => sidebarStore.newThread(group.project.id)}
          data-testid="new-thread"
          aria-label="Add thread"><Plus size={14} /></button
        >
      </Tooltip>
      <Tooltip text="New worktree — seeded from a copy of your current changes, main checkout is left untouched">
        <button
          class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
          onclick={() => sidebarStore.newWorktree(group.project.id)}
          data-testid="new-worktree-thread"><GitBranchPlus size={14} /></button
        >
      </Tooltip>
      <Tooltip text="Remove project">
        <button
          class="rounded p-1 text-faint hover:bg-surface-2 hover:text-danger"
          onclick={() => sidebarStore.removeProject(group.project)}
          data-testid="remove-project"
          aria-label="Remove project"><Trash2 size={14} /></button
        >
      </Tooltip>
    </div>
    {#if group.project.kind === "repo"}
      {@const openCount = workQueue.countFor(group.project.id)}
      {#if openCount > 0}
        <Tooltip text="Open work queue">
          <button
            class="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px]
              {collapsed ? 'opacity-0 group-hover:opacity-100' : ''}
              {activeView === 'work-queue' ? 'text-accent' : 'text-faint hover:text-fg'}"
            onclick={() => onOpenWorkQueue(group.project.id)}
            data-testid="project-work-queue"
            aria-label="Open work queue"><ListChecks size={14} /><span>{openCount}</span></button
          >
        </Tooltip>
      {:else}
        <Tooltip text="Open work queue">
          <button
            class="flex shrink-0 items-center rounded px-1 py-0.5
              {collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}
              {activeView === 'work-queue' ? 'text-accent opacity-100' : 'text-faint hover:text-fg'}"
            onclick={() => onOpenWorkQueue(group.project.id)}
            data-testid="project-work-queue"
            aria-label="Open work queue"><ListChecks size={14} /></button
          >
        </Tooltip>
      {/if}
    {/if}
    {#if group.snoozed.length > 0}
      <div class="relative flex shrink-0 items-center">
        <Tooltip text="Snoozed threads">
          <button
            class="flex items-center gap-1 rounded px-1 py-0.5 text-[10px]
              {collapsed ? 'opacity-0 group-hover:opacity-100' : ''}
              {sidebarStore.snoozedPopoverFor === group.project.id ? 'text-accent' : 'text-faint hover:text-fg'}"
            data-snooze-list-toggle
            onclick={(e) => {
              const btn = e.currentTarget as HTMLElement;
              sidebarStore.snoozedPopoverFor =
                sidebarStore.snoozedPopoverFor === group.project.id ? null : group.project.id;
              sidebarStore.snoozedListAnchor = sidebarStore.snoozedPopoverFor ? btn : null;
            }}
            data-testid="project-snoozed"
            aria-label="Snoozed threads"><Clock size={14} /><span>{group.snoozed.length}</span></button
          >
        </Tooltip>
        {#if sidebarStore.snoozedPopoverFor === group.project.id}
          <SnoozedPopover
            anchor={sidebarStore.snoozedListAnchor}
            threads={group.snoozed}
            onSelect={(id) => sidebarStore.selectThread(id)}
            onUnsnooze={(id) => void api.invoke("threads:unsnooze", id)}
            onClose={() => {
              sidebarStore.snoozedPopoverFor = null;
              sidebarStore.snoozedListAnchor = null;
            }}
          />
        {/if}
      </div>
    {/if}
    {#if group.toTest.length > 0}
      <Tooltip text="Open testing area">
        <button
          class="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px]
            {collapsed ? 'opacity-0 group-hover:opacity-100' : ''}
            {activeView === 'testing' ? 'text-accent' : 'text-faint hover:text-fg'}"
          onclick={() => onOpenTesting(group.project.id)}
          data-testid="project-to-test"
          aria-label="Open testing area"><FlaskConical size={14} /><span>{group.toTest.length}</span></button
        >
      </Tooltip>
    {/if}
  </div>
  <div
    class="done-panel"
    class:done-panel--open={!collapsed}
    class:done-panel--animated={!sidebarStore.reduceMotion}
  >
    <div class="done-panel__inner--grow">
      <!-- Local (project main checkout). Renders flat; no extra header layer —
           worktrees get their own section below. -->
      <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" previewSelector={sidebarStore.previewSelector}>
        {#each group.masterActive as thread (thread.id)}
          <ThreadRow thread={thread} variant="active" />
        {/each}
      </MovingHighlight>

      {#if group.worktreeFlatActive.length > 0 || group.worktreeNested.length > 0}
        <!-- Worktrees section. Tinted to distinguish from local. Single-thread
             worktrees render as flat tinted rows; ≥2 threads collapse under a
             nested header. -->
        <div class="worktrees-section" role="group" aria-label="Worktrees">
          <div class="worktrees-section__label">
            <GitBranch size={11} class="shrink-0 text-accent/70" />
            <span>Worktrees</span>
            {#if worktreeActiveTotal > 0}
              <span class="text-fainter">· {worktreeActiveTotal}</span>
            {/if}
          </div>

          <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" previewSelector={sidebarStore.previewSelector}>
            {#each group.worktreeFlatActive as thread (thread.id)}
              {@const wg = group.worktreeFlat.find((w) => w.active[0]?.id === thread.id)}
              <ThreadRow thread={thread} variant="active" worktreeName={wg?.worktree.name} />
            {/each}
          </MovingHighlight>

          {#each group.worktreeNested as wg (wg.worktree.id)}
            <div class="worktree-header flex items-center justify-between rounded-md px-2 py-0.5" role="group" aria-label={wg.worktree.name}>
              <span class="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted">
                <GitBranch size={12} class="shrink-0 text-accent/70" />
                <span class="truncate">{wg.worktree.name}</span>
                {#if wg.active.length > 0}
                  <span class="text-fainter">· {wg.active.length}</span>
                {/if}
              </span>
              <div class="flex items-center gap-0.5 opacity-0 hover:opacity-100">
                <Tooltip text="Add thread to worktree">
                  <button
                    class="rounded p-0.5 text-fainter hover:bg-surface-2 hover:text-fg"
                    onclick={() => sidebarStore.newThread(group.project.id, wg.worktree.id)}
                    aria-label="Add thread to worktree"><Plus size={12} /></button
                  >
                </Tooltip>
                <Tooltip text="Archive worktree and its threads">
                  <button
                    class="rounded p-0.5 text-fainter hover:bg-surface-2 hover:text-danger"
                    onclick={() => sidebarStore.archiveWorktree(wg.worktree)}
                    aria-label="Archive worktree"><Archive size={12} /></button
                  >
                </Tooltip>
              </div>
            </div>
            <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" previewSelector={sidebarStore.previewSelector}>
              {#each wg.active as thread (thread.id)}
                <ThreadRow thread={thread} variant="active" />
              {/each}
            </MovingHighlight>
          {/each}
        </div>
      {/if}

      <CollapsibleSection key={`ar:${group.project.id}`} label="Done" list={group.archived} variant="archived" />
    </div>
  </div>
</div>

<style>
  /* ── worktrees section: tinted container distinguishing worktree threads
     from local master. Single-thread worktrees render flat inside; ≥2
     threads collapse under a .worktree-header. ───────── */
  .worktrees-section {
    margin-top: 4px;
    /* Horizontal inset keeps rows (and the MovingHighlight active box, which
       measures them) clear of the section's left accent stripe and its 6px
       rounded corners; otherwise the selected-row grey box covers the stripe
       and its 8px corners clash with the section radius. */
    padding: 2px 6px 2px 8px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--color-accent) 4%, var(--color-surface) 96%);
    box-shadow: inset 2px 0 0 0 color-mix(in srgb, var(--color-accent) 35%, transparent);
  }
  /* Inside the tinted section, match the indicator radius to the section's
     6px (global default is 8px) so corners nest instead of poking out. */
  .worktrees-section :global(.sidebar-moving-highlight__indicator) {
    border-radius: 6px;
  }
  .worktrees-section__label {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 10px;
    font-size: 10px;
    font-weight: 500;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── worktree header: tinted to distinguish from master ───────── */
  .worktree-header {
    background: color-mix(in srgb, var(--color-accent) 6%, var(--color-surface) 94%);
    box-shadow: inset 2px 0 0 0 color-mix(in srgb, var(--color-accent) 60%, transparent);
  }
  .worktree-header:hover > div { opacity: 1; }
</style>
