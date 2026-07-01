<script lang="ts">
  import type { AppView, Project, Thread, Worktree } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { sidebarStore } from "../features/sidebar/sidebar.svelte";
  import SidebarTopbar from "../features/sidebar/SidebarTopbar.svelte";
  import SidebarNav from "../features/sidebar/SidebarNav.svelte";
  import ProjectGroup from "../features/sidebar/ProjectGroup.svelte";
  import ChatsSection from "../features/sidebar/ChatsSection.svelte";
  import RemoteGroups from "../features/sidebar/RemoteGroups.svelte";
  import Tooltip from "./Tooltip.svelte";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import FeedbackDialog from "../components/ui/dialog/FeedbackDialog.svelte";
  import Folder from "@lucide/svelte/icons/folder";
  import Plus from "@lucide/svelte/icons/plus";

  let {
    width = 280,
    projects,
    worktrees,
    threads,
    automationCount = 0,
    selectedThreadId,
    activeView,
    collapsedProjects = [],
    onSelect,
    onNewThread,
    onNewWorktree,
    onNewChat,
    onOpenView,
    onOpenTesting,
    onOpenWorkQueue,
    onOpenSearch,
    onGoBack,
    onGoForward,
    canGoBack = false,
    canGoForward = false,
    /** Remote-first mode on: the Remote item glows red + pulses. */
    remoteFirst = false,
  }: {
    width?: number;
    projects: Project[];
    worktrees: Worktree[];
    threads: Thread[];
    automationCount?: number;
    selectedThreadId: string | null;
    activeView: AppView;
    collapsedProjects?: string[];
    onSelect: (threadId: string) => void;
    onNewThread: (projectId: string, worktreeId?: string) => void;
    onNewWorktree: (projectId: string) => void;
    onNewChat: () => void;
    onOpenView: (view: AppView) => void;
    onOpenTesting: (projectId: string) => void;
    onOpenWorkQueue: (projectId: string) => void;
    onOpenSearch: () => void;
    onGoBack: () => void;
    onGoForward: () => void;
    canGoBack?: boolean;
    canGoForward?: boolean;
    remoteFirst?: boolean;
  } = $props();

  // Mirror props into the sidebar store. Top-level assignment runs once at
  // init (so the first render sees current data); `$effect.pre` re-syncs on
  // every prop update before re-render. Callbacks are plain (non-reactive)
  // fields read by store actions.
  function syncInputs() {
    sidebarStore.projects = projects;
    sidebarStore.worktrees = worktrees;
    sidebarStore.threads = threads;
    sidebarStore.selectedThreadId = selectedThreadId;
    sidebarStore.activeView = activeView;
    sidebarStore.collapsedProjects = collapsedProjects;
    sidebarStore.onSelect = onSelect;
    sidebarStore.onNewThread = onNewThread;
    sidebarStore.onNewWorktree = onNewWorktree;
    sidebarStore.onNewChat = onNewChat;
  }
  syncInputs();
  $effect.pre(syncInputs);

  // Feedback dialog is hosted in the sidebar (opened from the top nav cluster).
  let feedbackOpen = $state(false);

  $effect(() => {
    const id = setInterval(() => (sidebarStore.now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  // Once the real snapshot marks an optimistically-hidden thread archived (or
  // it no longer exists), drop it from the set so unarchive/restore can
  // surface it again.
  $effect(() => {
    if (sidebarStore.archivingIds.size === 0) return;
    const byId = new Map(sidebarStore.threads.map((t) => [t.id, t]));
    for (const id of sidebarStore.archivingIds) {
      const t = byId.get(id);
      if (!t || t.archivedAt) sidebarStore.archivingIds.delete(id);
    }
  });

  // Clear any pending auto-hide timers on teardown.
  $effect(() => {
    return () => {
      for (const k of Object.keys(sidebarStore.doneHideTimers)) clearTimeout(sidebarStore.doneHideTimers[k]);
      sidebarStore.doneHideTimers = {};
    };
  });
</script>

<svelte:window
  onkeydown={(e) => sidebarStore.onPreviewKeydown(e)}
  onkeyup={(e) => sidebarStore.onPreviewKeyup(e)}
  onblur={() => (sidebarStore.previewThreadId = null)}
/>

<aside
  class="flex h-full shrink-0 flex-col"
  style="width: {width}px"
>
  <SidebarTopbar
    {onOpenSearch}
    onOpenFeedback={() => (feedbackOpen = true)}
    {onGoBack}
    {onGoForward}
    {canGoBack}
    {canGoForward}
    {onOpenView}
  />

  <SidebarNav
    {activeView}
    {automationCount}
    {onOpenView}
    {remoteFirst}
  />

  <!-- Projects -->
  <div class="flex items-center justify-between px-4 pt-2 pb-1.5">
    <span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase {sidebarStore.activeProjectId ? 'engraved--active' : ''}"><Folder size={12} /> Projects</span>
    <Tooltip text="Add project">
      <button
        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
        onclick={() => api.invoke("projects:pick")}
        data-testid="add-project"><Plus size={15} /></button
      >
    </Tooltip>
  </div>
  <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-2" style="scrollbar-gutter: stable">
    {#each sidebarStore.byProject as group (group.project.id)}
      <ProjectGroup
        {group}
        {activeView}
        {onOpenTesting}
        {onOpenWorkQueue}
      />
    {:else}
      <p class="px-2 text-xs text-fainter">No projects yet. Add one with +.</p>
    {/each}
  </nav>

  <ChatsSection />

  <!-- Remote masters: threads watched on another machine (ADR-0009/0010) -->
  <RemoteGroups />
</aside>

<ConfirmDialog
  bind:open={sidebarStore.archiveDialogOpen}
  title="Archive worktree"
  description={sidebarStore.archiveWorktreeDescription}
  confirmLabel="Archive"
  destructive
  onConfirm={() => sidebarStore.confirmArchiveWorktree()}
/>

<ConfirmDialog
  bind:open={sidebarStore.removeProjectDialogOpen}
  title="Remove project"
  description={sidebarStore.removeProjectDescription}
  confirmLabel="Remove"
  destructive
  onConfirm={() => sidebarStore.confirmRemoveProject()}
/>

<ConfirmDialog
  bind:open={sidebarStore.archiveSoleWorktreeDialogOpen}
  title="Archive thread and worktree?"
  description="This is the only thread in its worktree, so archiving it removes the worktree's git checkout too. This can't be undone."
  confirmLabel="Archive thread + worktree"
  destructive
  dontShowAgainLabel="Don't warn me about this"
  onConfirm={(dontShowAgain) => sidebarStore.confirmArchiveSoleWorktreeThread(dontShowAgain)}
/>

<FeedbackDialog bind:open={feedbackOpen} />

<style>
  /* Sidebar-wide structural + animation styles. The markup lives in the
     per-concern children (ProjectGroup / CollapsibleSession / ChatsSection /
     ThreadRow), so these are emitted as `:global` to apply across the
     component boundary. */

  /* ── per-variant card pop (hero motion) ────────────────────────── */
  :global(.session-row.done-pop) { transform-origin: center; }

  /* v0 Precision archive slide */
  :global(.session-row.done-pop--archiveSlide) {
    position: relative;
    overflow: hidden;
    transform-origin: center top;
    animation: archive-slide 480ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  :global(.session-row.done-pop--archiveSlide)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      105deg,
      transparent 38%,
      oklch(1 0 0 / 0.55) 47%,
      oklch(1 0 0 / 0.95) 50%,
      oklch(1 0 0 / 0.55) 53%,
      transparent 62%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: archive-glint 230ms cubic-bezier(0.4, 0, 0.2, 1) 70ms forwards;
  }
  @keyframes archive-slide {
    0%   { transform: translateY(0) scale(1);     box-shadow: none; }
    16%  { transform: translateY(0) scale(0.985); box-shadow: inset 0 1px 2px oklch(0 0 0 / 0.28); }
    24%  { transform: translateY(0) scale(0.992); box-shadow: none; }
    62%  { transform: translateY(8px) scale(0.99);  opacity: 0.28; max-height: 2.4rem; }
    70%  { transform: translateY(10px) scale(0.985); opacity: 0.06; max-height: 2.4rem;
           padding-top: 0.375rem; padding-bottom: 0.375rem; margin-top: 0; margin-bottom: 0; }
    100% { transform: translateY(10px) scale(0.985); opacity: 0; max-height: 0;
           padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
  }
  @keyframes archive-glint {
    0%   { transform: translateX(-130%); opacity: 0; }
    25%  { opacity: 1; }
    100% { transform: translateX(130%);  opacity: 0; }
  }

  /* v0b Archive swipe */
  :global(.session-row.done-pop--archiveSwipe) {
    position: relative;
    overflow: hidden;
    transform-origin: center top;
    animation: archive-swipe 420ms cubic-bezier(0.3, 0, 0.2, 1) forwards;
  }
  :global(.session-row.done-pop--archiveSwipe)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      100deg,
      transparent 36%,
      oklch(1 0 0 / 0.7) 48%,
      oklch(1 0 0 / 1) 50%,
      oklch(1 0 0 / 0.7) 52%,
      transparent 64%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: archive-glint 180ms cubic-bezier(0.4, 0, 0.2, 1) 50ms forwards;
  }
  @keyframes archive-swipe {
    0%   { transform: translate(0, 0) rotate(0) scale(1);     box-shadow: none; }
    14%  { transform: translate(0, 0) rotate(0) scale(0.978); box-shadow: inset 0 1px 3px oklch(0 0 0 / 0.32); }
    22%  { transform: translate(-2px, 0) rotate(-0.4deg) scale(0.99); box-shadow: none; }
    58%  { transform: translate(20px, 9px) rotate(1deg) scale(0.97); opacity: 0.22; max-height: 2.4rem; }
    68%  { transform: translate(26px, 12px) rotate(1.4deg) scale(0.96); opacity: 0.04; max-height: 2.4rem;
           padding-top: 0.375rem; padding-bottom: 0.375rem; margin-top: 0; margin-bottom: 0; }
    100% { transform: translate(26px, 12px) rotate(1.4deg) scale(0.96); opacity: 0; max-height: 0;
           padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
  }

  /* v0c Archive shing */
  :global(.session-row.done-pop--archiveShing) {
    position: relative;
    overflow: hidden;
    transform-origin: center top;
    animation: archive-shing 460ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  :global(.session-row.done-pop--archiveShing)::before,
  :global(.session-row.done-pop--archiveShing)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: screen;
  }
  :global(.session-row.done-pop--archiveShing)::after {
    background: linear-gradient(100deg, transparent 38%, oklch(1 0 0 / 0.85) 50%, transparent 62%);
    transform: translateX(-130%);
    animation: archive-glint 200ms cubic-bezier(0.4, 0, 0.2, 1) 40ms forwards;
  }
  :global(.session-row.done-pop--archiveShing)::before {
    background: linear-gradient(260deg, transparent 38%, oklch(1 0 0 / 0.6) 50%, transparent 62%);
    transform: translateX(130%);
    animation: archive-glint-rev 200ms cubic-bezier(0.4, 0, 0.2, 1) 120ms forwards;
  }
  @keyframes archive-glint-rev {
    0%   { transform: translateX(130%);  opacity: 0; }
    25%  { opacity: 1; }
    100% { transform: translateX(-130%); opacity: 0; }
  }
  @keyframes archive-shing {
    0%   { transform: translateY(0) scale(1);     filter: brightness(1);    box-shadow: none; }
    12%  { transform: translateY(0) scale(0.98);  filter: brightness(1);    box-shadow: inset 0 1px 3px oklch(0 0 0 / 0.3); }
    30%  { transform: translateY(0) scale(1.012); filter: brightness(1.55); box-shadow: none; }
    42%  { transform: translateY(0) scale(0.995); filter: brightness(1);    }
    64%  { transform: translateY(9px) scale(0.985); opacity: 0.2; max-height: 2.4rem; }
    72%  { transform: translateY(11px) scale(0.98); opacity: 0.04; max-height: 2.4rem;
           padding-top: 0.375rem; padding-bottom: 0.375rem; margin-top: 0; margin-bottom: 0; }
    100% { transform: translateY(11px) scale(0.98); opacity: 0; max-height: 0;
           padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
  }

  /* v0d Archive vacuum */
  :global(.session-row.done-pop--archiveVacuum) {
    position: relative;
    overflow: hidden;
    transform-origin: right center;
    animation: archive-vacuum 500ms cubic-bezier(0.5, 0, 0.75, 0) forwards;
  }
  :global(.session-row.done-pop--archiveVacuum)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      95deg,
      transparent 30%,
      oklch(1 0 0 / 0.8) 49%,
      oklch(1 0 0 / 1) 50%,
      oklch(1 0 0 / 0.8) 51%,
      transparent 70%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: archive-glint 200ms cubic-bezier(0.4, 0, 0.2, 1) 40ms forwards;
  }
  @keyframes archive-vacuum {
    0%   { transform: translate(0, 0) scaleX(1) scaleY(1) skewX(0);          filter: blur(0);     box-shadow: none; }
    14%  { transform: translate(0, 0) scaleX(1.03) scaleY(0.97) skewX(0);    filter: blur(0);     box-shadow: inset 0 1px 3px oklch(0 0 0 / 0.34); }
    24%  { transform: translate(0, 0) scaleX(1) scaleY(1) skewX(0);          filter: blur(0);     box-shadow: none; }
    62%  { transform: translate(18px, 10px) scaleX(0.7) scaleY(0.92) skewX(-8deg); filter: blur(0.6px); opacity: 0.3; max-height: 2.4rem; }
    74%  { transform: translate(34px, 14px) scaleX(0.45) scaleY(0.85) skewX(-14deg); filter: blur(1.4px); opacity: 0.04; max-height: 2.4rem;
           padding-top: 0.375rem; padding-bottom: 0.375rem; margin-top: 0; margin-bottom: 0; }
    100% { transform: translate(40px, 16px) scaleX(0.3) scaleY(0.8) skewX(-16deg);  filter: blur(2px);   opacity: 0; max-height: 0;
           padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
  }

  /* v1 Pop & sparkle */
  :global(.session-row.done-pop--popSpark) { animation: pop-spark 420ms steps(1, jump-end); }
  @keyframes pop-spark {
    0%   { transform: scale(1)    rotate(0);     }
    15%  { transform: scale(0.92) rotate(0);     }
    35%  { transform: scale(1.08) rotate(-2deg); }
    55%  { transform: scale(0.97) rotate(1.5deg);}
    75%  { transform: scale(1.03) rotate(-0.5deg);}
    100% { transform: scale(1)    rotate(0);     }
  }

  /* v2 Approval stamp */
  :global(.session-row.done-pop--stamp) { animation: pop-stamp 380ms steps(1, jump-end); }
  @keyframes pop-stamp {
    0%   { transform: scale(1.3) rotate(-4deg); }
    35%  { transform: scale(0.9) rotate(1deg);   }
    60%  { transform: scale(1.06) rotate(-1deg); }
    100% { transform: scale(1)    rotate(0);     }
  }

  /* v3 Confetti */
  :global(.session-row.done-pop--confetti) { animation: pop-confetti 460ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes pop-confetti {
    0%   { transform: scale(1);    }
    40%  { transform: scale(1.12); }
    70%  { transform: scale(0.97); }
    100% { transform: scale(1);    }
  }

  /* v4 Full on-twos */
  :global(.session-row.done-pop--twos) { animation: pop-spark 420ms steps(1, jump-end); }

  /* v5 Springy ring */
  :global(.session-row.done-pop--spring) { animation: pop-spring 620ms cubic-bezier(0.5, 1.4, 0.5, 1); }
  @keyframes pop-spring {
    0%   { transform: scale(1);    }
    25%  { transform: scale(1.1);  }
    45%  { transform: scale(0.96); }
    65%  { transform: scale(1.04); }
    82%  { transform: scale(0.99); }
    100% { transform: scale(1);    }
  }

  /* ── Mark-to-test animation (testBench) ────────────────────────── */
  :global(.session-row.test-pop) { transform-origin: center; }
  :global(.session-row.test-pop--testBench) {
    position: relative;
    overflow: hidden;
    transform-origin: center top;
    animation: test-bench-row 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  :global(.session-row.test-pop--testBench)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      100deg,
      transparent 44%,
      oklch(0.82 0.16 75 / 0.6) 48%,
      oklch(0.92 0.18 200 / 0.95) 50%,
      oklch(0.82 0.16 75 / 0.6) 52%,
      transparent 56%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: test-bench-scan 180ms cubic-bezier(0.4, 0, 0.2, 1) 60ms forwards;
  }
  :global(.session-row.test-pop--testBench)::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    box-shadow:
      inset 0 0 0 1.5px oklch(0.82 0.16 75 / 0.9),
      inset 0 0 14px 2px oklch(0.82 0.16 75 / 0.35);
    background: oklch(0.82 0.16 75 / 0.08);
    opacity: 0;
    animation: test-bench-stamp 140ms cubic-bezier(0.16, 1, 0.3, 1) 160ms forwards;
  }
  @keyframes test-bench-row {
    0%   { transform: translateY(0) scale(1);      box-shadow: none; }
    14%  { transform: translateY(0) scale(0.99);  box-shadow: inset 0 1px 2px oklch(0 0 0 / 0.22); }
    22%  { transform: translateY(0) scale(0.996); box-shadow: none; }
    58%  { transform: translateY(4px) scale(0.99); opacity: 0.55; }
    100% { transform: translateY(4px) scale(0.99); opacity: 0.55; }
  }
  @keyframes test-bench-scan {
    0%   { transform: translateX(-130%); opacity: 0; }
    20%  { opacity: 1; }
    100% { transform: translateX(130%);  opacity: 0; }
  }
  @keyframes test-bench-stamp {
    0%, 55% { opacity: 0; }
    58%     { opacity: 1; }
    100%    { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.session-row.done-pop) { animation: none !important; }
    :global(.session-row.test-pop) { animation: none !important; }
  }

  /* ── auto-collapsing Done accordion ───────────────────────────── */
  :global(.done-panel) {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
  }
  :global(.done-panel--animated) {
    transition:
      grid-template-rows 200ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms ease;
  }
  :global(.done-panel--open) {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  :global(.done-panel__inner) {
    min-height: 0;
    overflow-y: auto;
    max-height: 16rem;
    scrollbar-width: none;
  }
  :global(.done-panel__inner::-webkit-scrollbar) { display: none; }
  :global(.chats-scroll) {
    overflow-x: hidden;
    scrollbar-width: none;
  }
  :global(.chats-scroll::-webkit-scrollbar) { display: none; }
  /* Uncapped variant for the project body: threads live in the sidebar's
     scroll container, so the panel must grow to fit (no nested scroll). */
  :global(.done-panel__inner--grow) {
    min-height: 0;
    overflow: hidden;
  }
</style>
