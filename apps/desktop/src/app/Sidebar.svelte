<script lang="ts">
  import type { AppView, Project, Thread, Worktree } from "@peach-pi/shared-types";
  import { isNewThread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { SvelteSet } from "svelte/reactivity";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { workQueue } from "../stores/work-queue.svelte";
  import { FLEET_WIDGET_KEY, parseFleet } from "../lib/subagent/fleet";
  import { playButtonSecondary, playRotary } from "../lib/sound/button-click-sound";
  import SnoozePicker from "./SnoozePicker.svelte";
  import SnoozedPopover from "./SnoozedPopover.svelte";
  import ExtUpdatesPopover from "./ExtUpdatesPopover.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import MovingHighlight from "./MovingHighlight.svelte";
  import Tooltip from "./Tooltip.svelte";
  import Search from "@lucide/svelte/icons/search";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import FlaskConicalOff from "@lucide/svelte/icons/flask-conical-off";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import BellRing from "@lucide/svelte/icons/bell-ring";
  import Plug from "@lucide/svelte/icons/plug";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Radio from "@lucide/svelte/icons/radio";
  import Gauge from "@lucide/svelte/icons/gauge";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Settings from "@lucide/svelte/icons/settings";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Clock from "@lucide/svelte/icons/clock";
  import Check from "@lucide/svelte/icons/check";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import DoneBurst from "./DoneBurst.svelte";
  import TestBurst from "./TestBurst.svelte";
  import { doneAnim } from "../lib/done-anim.svelte";
  import { playArchiveSound } from "../lib/sound/done-sound";
  import { playTestSound } from "../lib/sound/test-sound";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Folder from "@lucide/svelte/icons/folder";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Megaphone from "@lucide/svelte/icons/megaphone";
  import Archive from "@lucide/svelte/icons/archive";
  import GitBranchPlus from "@lucide/svelte/icons/git-branch-plus";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { TAG_META } from "../lib/tag-meta";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import FeedbackDialog from "../components/ui/dialog/FeedbackDialog.svelte";
  import { snapshot } from "../stores/snapshot.svelte";
  import { usage } from "../stores/usage.svelte";
  import { usagePrefs } from "../stores/usage-prefs.svelte";
  import { featuredMetrics, shortTag, urgencyClass, fmtResetsIn } from "../lib/usage-featured";
  import UsagePopover from "./UsagePopover.svelte";

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
    /** Remote-first mode on: the Remote item glows red + pulses. */
    remoteFirst?: boolean;
  } = $props();

  let expanded = $state<Record<string, boolean>>({});
  let snoozePickerFor = $state<string | null>(null);
  let snoozedPopoverFor = $state<string | null>(null);
  let snoozeAnchor: HTMLElement | null = $state(null);
  let snoozedListAnchor: HTMLElement | null = $state(null);
  let doneAnimFor = $state<string | null>(null);
  // Thread currently playing the mark-to-test animation. Mirrors doneAnimFor:
  // the row holds its end-state until the real threads:markToTest snapshot
  // lands, so it doesn't spring back to normal for the gap frames.
  let testAnimFor = $state<string | null>(null);
  // Ids whose archive animation has finished but whose archived snapshot
  // hasn't landed yet. Filtered out of the active lists so the row leaves
  // the DOM at its collapsed end-state instead of springing back to full
  // height for the frames before the async threads:archive snapshot arrives.
  let archivingIds = $state(new SvelteSet<string>());

  // Available extension-updates popover anchored under the amber badge button.
  let extUpdatesAnchor: HTMLElement | null = $state(null);
  let extUpdatesOpen = $state(false);

  // Global reload-all-sessions button spin state.
  let reloading = $state(false);

  // Feedback dialog (hosted in the sidebar, opened from the top nav cluster).
  let feedbackOpen = $state(false);

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

  // The usage popover anchored under the Usage nav button. Opens on click
  // and closes on outside-click (handled inside UsagePopover).
  let usageAnchor: HTMLButtonElement | null = $state(null);
  let usageOpen = $state(false);
  function toggleUsagePopover(): void {
    playButtonSecondary("click");
    usageOpen = !usageOpen;
  }

  // Featured (pinned) metrics for the compact sidebar line, one per provider.
  const featuredLine = $derived(
    usage.summaries
      .filter((s) => !usagePrefs.isHidden(s.provider))
      .flatMap((s) =>
        featuredMetrics(s, usagePrefs.keysFor(s.provider)).map((m) => ({ provider: s.provider, key: m.key, m })),
      ),
  );
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

  const chats = $derived(threads.filter((t) => t.projectId === null && !t.remoteHostId));
  // Threads mirrored from remote masters, grouped per host → per project so
  // they nest under the master's real project names (each row is also tagged
  // remote).
  const remoteGroups = $derived.by(() => {
    const byHost = new Map<string, { name: string; projects: Map<string, Thread[]> }>();
    for (const t of threads) {
      if (!t.remoteHostId) continue;
      const h =
        byHost.get(t.remoteHostId) ??
        { name: t.remoteHostName ?? "Remote", projects: new Map<string, Thread[]>() };
      const pname = t.remoteProjectName ?? "Chats";
      const arr = h.projects.get(pname) ?? [];
      arr.push(t);
      h.projects.set(pname, arr);
      byHost.set(t.remoteHostId, h);
    }
    return [...byHost.entries()].map(([id, h]) => ({
      id,
      name: h.name,
      projects: [...h.projects.entries()].map(([name, projectThreads]) => ({ name, threads: projectThreads })),
    }));
  });

  function partition(list: Thread[]) {
    return {
      // A thread that just woke from snooze (wokeFromSnoozeAt set) pins to
      // the very top of the active area, above the usual activity order.
      // Cleared once the thread is opened (markSeen in repositories.ts).
      active: list
        .filter((t) => !t.archivedAt && !t.snoozedUntil && !t.toTestAt && !archivingIds.has(t.id))
        .sort((a, b) => {
          const aw = !!a.wokeFromSnoozeAt;
          const bw = !!b.wokeFromSnoozeAt;
          if (aw !== bw) return aw ? -1 : 1;
          return 0;
        }),
      snoozed: list.filter((t) => !t.archivedAt && t.snoozedUntil),
      toTest: list.filter((t) => !t.archivedAt && !t.snoozedUntil && t.toTestAt),
      archived: list
        .filter((t) => t.archivedAt)
        .sort((a, b) => (b.archivedAt! < a.archivedAt! ? -1 : 1)),
    };
  }

  const byProject = $derived(
    projects.map((p) => {
      const projThreads = threads.filter((t) => t.projectId === p.id);
      const parts = partition(projThreads);
      const projWorktrees = worktrees.filter(
        (w) => w.projectId === p.id && !w.archivedAt,
      );
      const masterActive = parts.active.filter((t) => !t.worktreeId);
      // Worktrees with 0–1 active threads render as flat tinted rows.
      // Worktrees with ≥2 active threads collapse under a nested header.
      const worktreeFlat = projWorktrees
        .map((w) => ({ worktree: w, active: parts.active.filter((t) => t.worktreeId === w.id) }))
        .filter((wg) => wg.active.length <= 1);
      const worktreeNested = projWorktrees
        .map((w) => ({ worktree: w, active: parts.active.filter((t) => t.worktreeId === w.id) }))
        .filter((wg) => wg.active.length >= 2);
      // Flat threads in display order: under their single-thread worktree,
      // then orphan single-thread worktrees show their one thread.
      const worktreeFlatActive = worktreeFlat.flatMap((wg) => wg.active);
      return { project: p, ...parts, masterActive, worktreeFlat, worktreeFlatActive, worktreeNested };
    }),
  );
  const chatGroups = $derived(partition(chats));

  // Once the real snapshot marks an optimistically-hidden thread archived
  // (or it no longer exists), drop it from the set so unarchive/restore can
  // surface it again.
  $effect(() => {
    if (archivingIds.size === 0) return;
    const byId = new Map(threads.map((t) => [t.id, t]));
    for (const id of archivingIds) {
      const t = byId.get(id);
      if (!t || t.archivedAt) archivingIds.delete(id);
    }
  });

  // Thread IDs with at least one still-running background subagent, per
  // the pi-subagents "subagent-status" widget feed. A `later_message` helper
  // returns before its work is done, so the parent thread's status flips to
  // "completed" while the child is still active — the sidebar spinner would
  // otherwise vanish mid-run. Keep it spinning while the fleet feed reports
  // live agents.
  const fleetActiveIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const [threadId, map] of extensionUi.widgetEntries()) {
      const lines = map.get(FLEET_WIDGET_KEY);
      if (lines && parseFleet(lines)?.count) ids.add(threadId);
    }
    return ids;
  });

  // The project the active thread belongs to (null for chats / non-thread
  //  views). Drives the Projects section label glow.
  const activeProjectId = $derived(
    activeView === "thread" && selectedThreadId
      ? threads.find((t) => t.id === selectedThreadId)?.projectId ?? null
      : null,
  );
  // True when the selected thread is a project-less chat — drives the Chats
  //  section label glow (mirrors the Projects label for project threads).
  const chatActive = $derived(
    activeView === "thread" && selectedThreadId && activeProjectId === null,
  );

  // Flat, top-to-bottom order of the rows ⌘⇧↑/↓ can land on: every visible
  // active row (master threads, then each worktree's threads, per project;
  // then chats). Collapsed groups (snoozed/to-test/past) are intentionally excluded.
  const previewOrder = $derived([
    ...byProject
      .filter((g) => !isCollapsed(g.project.id))
      .flatMap((g) => [...g.masterActive, ...g.worktreeFlatActive, ...g.worktreeNested.flatMap((wg) => wg.active)]),
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
      selectThread(id);
    }
  }

  function selectThread(id: string) {
    playRotary();
    onSelect(id);
  }

  // Auto-hide for "Done" dropdowns only: collapse after DONE_HIDE_MS of
  // no pointer interaction. Cancel-while-hovered, restart-on-leave.
  const DONE_HIDE_MS = 10_000;
  const reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let doneHideTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  function isDoneKey(key: string): boolean {
    return key.startsWith("ar:") || key === "chats:past";
  }

  function startDoneHide(key: string) {
    if (!isDoneKey(key)) return;
    clearDoneHide(key);
    doneHideTimers[key] = setTimeout(() => toggle(key, false), DONE_HIDE_MS);
  }

  function clearDoneHide(key: string) {
    const t = doneHideTimers[key];
    if (t) {
      clearTimeout(t);
      delete doneHideTimers[key];
    }
  }

  function toggle(key: string, value?: boolean) {
    const next = value ?? !expanded[key];
    expanded = { ...expanded, [key]: next };
    if (next) startDoneHide(key);
    else clearDoneHide(key);
  }

  $effect(() => {
    return () => {
      for (const k of Object.keys(doneHideTimers)) clearTimeout(doneHideTimers[k]);
      doneHideTimers = {};
    };
  });

  function newThread(projectId: string, worktreeId?: string) {
    playButtonSecondary("click");
    onNewThread(projectId, worktreeId);
  }

  function newWorktree(projectId: string) {
    playButtonSecondary("click");
    onNewWorktree(projectId);
  }

  let pendingArchiveWorktree = $state<Worktree | null>(null);
  let archiveDialogOpen = $state(false);
  function archiveWorktree(worktree: Worktree) {
    pendingArchiveWorktree = worktree;
    archiveDialogOpen = true;
  }
  function confirmArchiveWorktree() {
    const worktree = pendingArchiveWorktree;
    if (!worktree) return;
    void api.invoke("worktrees:archive", worktree.id);
    pendingArchiveWorktree = null;
    archiveDialogOpen = false;
  }

  function newChat() {
    playButtonSecondary("click");
    onNewChat();
  }

  let pendingRemoveProject = $state<Project | null>(null);
  let removeProjectDialogOpen = $state(false);
  const removeProjectDescription = $derived(
    pendingRemoveProject
      ? `Remove project "${pendingRemoveProject.name}" and all its threads? This can't be undone.`
      : "",
  );
  function removeProject(project: Project) {
    // projects:remove cascades to all the project's threads (ON DELETE CASCADE).
    pendingRemoveProject = project;
    removeProjectDialogOpen = true;
  }
  function confirmRemoveProject() {
    if (pendingRemoveProject) api.invoke("projects:remove", pendingRemoveProject.id);
    pendingRemoveProject = null;
    removeProjectDialogOpen = false;
  }

  // Reversible thread actions show an undo toast (inverse IPC channel).
  // Marking Done plays the burst first; finishArchive runs the real archive
  // once the animation reports back so the row survives the effect.
  // An empty (never-prompted) thread is destroyed instead — the done area
  // must never hold empty rows, and there's nothing to archive anyway.
  //
  // Special case: archiving the only remaining thread in a worktree also
  // tears down the worktree (its branch + checkout) because the thread IS
  // the worktree's purpose for existing. Forbidden silently when the user
  // ticked "don't warn me again"; otherwise opens a confirm dialog (the
  // teardown is non-reversible, so the done-burst/Undo flow doesn't fit).
  let pendingArchiveSoleWorktreeThread = $state<Thread | null>(null);
  let archiveSoleWorktreeDialogOpen = $state(false);
  const archiveSoleWorktreeWarningDismissed = $derived(
    snapshot.current?.ui.archiveThreadWorktreeWarningDismissed ?? false,
  );
  /** Non-archived siblings of the thread's worktree (excluding the thread
   *  itself). When empty, archiving this thread would orphan the worktree. */
  function soleThreadInWorktree(thread: Thread): boolean {
    if (!thread.worktreeId) return false;
    const siblings = threads.filter(
      (t) => t.worktreeId === thread.worktreeId && !t.archivedAt && t.id !== thread.id,
    );
    return siblings.length === 0;
  }
  function archiveThread(thread: Thread) {
    if (isNewThread(thread.title)) {
      const idx = previewOrder.indexOf(thread.id);
      const nextId = idx !== -1 ? (previewOrder[idx + 1] ?? previewOrder[idx - 1] ?? null) : null;
      void api.invoke("threads:delete", thread.id);
      if (nextId && thread.id === selectedThreadId) onSelect(nextId);
      return;
    }
    // Sole-thread worktree: archive both thread + worktree. Non-reversible,
    // so gate on an explicit confirm unless the user opted out.
    if (soleThreadInWorktree(thread)) {
      pendingArchiveSoleWorktreeThread = thread;
      if (archiveSoleWorktreeWarningDismissed) {
        confirmArchiveSoleWorktreeThread(false);
      } else {
        archiveSoleWorktreeDialogOpen = true;
      }
      return;
    }
    playArchiveSound();
    doneAnimFor = thread.id;
  }
  function confirmArchiveSoleWorktreeThread(dontShowAgain: boolean | undefined) {
    const thread = pendingArchiveSoleWorktreeThread;
    if (!thread) return;
    if (dontShowAgain) {
      void api.invoke("ui:setArchiveThreadWorktreeWarningDismissed", true);
    }
    // Pick the next thread below before this one leaves the list, so the
    // view advances instead of landing on nothing.
    const idx = previewOrder.indexOf(thread.id);
    const nextId = idx !== -1 ? (previewOrder[idx + 1] ?? previewOrder[idx - 1] ?? null) : null;
    archivingIds.add(thread.id);
    // worktrees:archive tears down the worktree AND archives every thread in
    // it (AppService.archive), so this single call covers both rows.
    if (thread.worktreeId) void api.invoke("worktrees:archive", thread.worktreeId);
    if (nextId && thread.id === selectedThreadId) onSelect(nextId);
    pendingArchiveSoleWorktreeThread = null;
    archiveSoleWorktreeDialogOpen = false;
  }
  function finishArchive(thread: Thread) {
    // Pick the next thread below before this one leaves the list, so the
    // view advances instead of landing on nothing.
    const idx = previewOrder.indexOf(thread.id);
    const nextId = idx !== -1 ? (previewOrder[idx + 1] ?? previewOrder[idx - 1] ?? null) : null;
    // Hide the row locally *before* clearing doneAnimFor so it unmounts at
    // its collapsed end-state — clearing the class alone would spring the
    // row back to full height until the async archive snapshot lands.
    archivingIds.add(thread.id);
    if (doneAnimFor === thread.id) doneAnimFor = null;
    void api.invoke("threads:archive", thread.id);
    if (nextId && thread.id === selectedThreadId) onSelect(nextId);
    extensionUi.notify(`Archived “${thread.title || "Untitled"}”`, {
      label: "Undo",
      run: () => void api.invoke("threads:unarchive", thread.id),
    });
  }
  // Marking to test plays the burst first; finishMarkToTest runs the real
  // markToTest once the animation reports back so the row survives the
  // effect — mirroring the archive flow.
  function markThreadToTest(thread: Thread) {
    playTestSound();
    testAnimFor = thread.id;
  }
  function finishMarkToTest(thread: Thread) {
    const idx = previewOrder.indexOf(thread.id);
    const nextId = idx !== -1 ? (previewOrder[idx + 1] ?? previewOrder[idx - 1] ?? null) : null;
    testAnimFor = thread.id === testAnimFor ? null : testAnimFor;
    void api.invoke("threads:markToTest", thread.id);
    if (nextId && thread.id === selectedThreadId) onSelect(nextId);
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

  const pendingArchiveWorktreeName = $derived(pendingArchiveWorktree?.name ?? "");
  const archiveWorktreeDescription = $derived(
    `“${pendingArchiveWorktreeName}” and all its threads will be archived, and the checkout removed.`,
  );
  async function reloadAll() {
    if (reloading) return;
    reloading = true;
    try {
      const res = await api.invoke("threads:reloadAll");
      if (res.queued.length > 0) {
        extensionUi.notify(
          `Reloaded ${res.reloaded.length}; ${res.queued.length} queued for when its run finishes.`,
          undefined,
          "info",
        );
      } else if (res.reloaded.length === 0) {
        extensionUi.notify("No active sessions to reload.", undefined, "info");
      }
    } finally {
      reloading = false;
    }
  }
</script>

{#snippet threadRow(thread: Thread, variant: "active" | "snoozed" | "toTest" | "archived", worktreeName?: string)}
  {@const isActive = activeView === "thread" && selectedThreadId === thread.id}
  {@const Tag = TAG_META[thread.tag ?? "other"]}
  {@const woke = variant === "active" && !!thread.wokeFromSnoozeAt}
  <div
    class="group relative flex items-center"
    style:z-index={snoozePickerFor === thread.id ? 30 : undefined}
  >
    {#if doneAnimFor === thread.id}
      <DoneBurst ondone={() => finishArchive(thread)} />
    {/if}
    {#if testAnimFor === thread.id}
      <TestBurst ondone={() => finishMarkToTest(thread)} />
    {/if}
    <button
      class="session-row flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-1.5 text-left text-[13px]
        {isActive ? 'session-row--active text-fg' : 'text-muted hover:text-fg'}"
      class:done-pop={doneAnimFor === thread.id}
      class:done-pop--archiveSlide={doneAnimFor === thread.id && doneAnim.current === "archiveSlide"}
      class:done-pop--archiveSwipe={doneAnimFor === thread.id && doneAnim.current === "archiveSwipe"}
      class:done-pop--archiveShing={doneAnimFor === thread.id && doneAnim.current === "archiveShing"}
      class:done-pop--archiveVacuum={doneAnimFor === thread.id && doneAnim.current === "archiveVacuum"}
      class:done-pop--popSpark={doneAnimFor === thread.id && doneAnim.current === "popSpark"}
      class:done-pop--stamp={doneAnimFor === thread.id && doneAnim.current === "stamp"}
      class:done-pop--confetti={doneAnimFor === thread.id && doneAnim.current === "confetti"}
      class:done-pop--twos={doneAnimFor === thread.id && doneAnim.current === "twos"}
      class:done-pop--spring={doneAnimFor === thread.id && doneAnim.current === "spring"}
      class:test-pop={testAnimFor === thread.id}
      class:test-pop--testBench={testAnimFor === thread.id}
      data-thread-id={thread.id}
      data-press="self"
      onclick={() => selectThread(thread.id)}
    >
      {#if thread.remoteHostId}
        <Radio
          size={13}
          class="shrink-0 {thread.status === 'completed'
            ? 'text-accent'
            : thread.status === 'failed'
              ? 'text-danger'
              : 'text-faint'}"
          title="Remote session on {thread.remoteHostName ?? 'another machine'}"
        />
      {:else if woke}
        <BellRing
          size={13}
          class="shrink-0 text-warning"
          title="Woke from snooze"
          data-testid="woke-from-snooze-icon"
        />
      {:else}
        <Tag.icon
          size={13}
          class="shrink-0 {thread.status === 'completed'
            ? 'text-accent'
            : thread.status === 'failed'
              ? 'text-danger'
              : 'text-faint'}"
          title={thread.status === "failed" ? "Failed" : Tag.label}
        />
      {/if}
      <span
        class="truncate {variant === 'archived'
          ? 'text-fainter'
          : woke
            ? 'text-warning'
            : thread.status === 'failed'
              ? 'text-danger'
              : thread.status === 'completed' && !isActive
                ? 'text-accent'
                : ''}">{thread.title}</span>
      {#if worktreeName}
        <span class="shrink-0 truncate text-[10px] text-accent/60">· {worktreeName}</span>
      {/if}
      {#if thread.status === "running" || fleetActiveIds.has(thread.id)}
        <BrailleSpinner class="session-spinner ml-auto mr-0 shrink-0" title="Thinking…" shape="hex" />
      {:else if variant === "active"}
        <span class="ml-auto shrink-0 text-[10px] text-fainter">{relativeTime(thread.lastActivityAt, now)}</span>
      {/if}
    </button>
    <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-surface group-hover:flex">
      {#if variant === "active"}
        <Tooltip text="Snooze">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            data-snooze-toggle
            onclick={(e) => {
              snoozePickerFor = snoozePickerFor === thread.id ? null : thread.id;
              snoozeAnchor = snoozePickerFor ? e.currentTarget : null;
            }}
          ><Clock size={14} /></button>
        </Tooltip>
        <Tooltip text="Mark to test">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            onclick={() => markThreadToTest(thread)}
          ><FlaskConical size={14} /></button>
        </Tooltip>
        <Tooltip text="Done">
          <button
            class="rounded p-1 text-faint hover:text-fg"
            onclick={() => archiveThread(thread)}
          ><Check size={14} /></button>
        </Tooltip>
      {:else if variant === "toTest"}
        <button
          class="rounded p-1 text-faint hover:text-fg"
          title="Unmark"
          onclick={() => api.invoke("threads:unmarkToTest", thread.id)}
        ><FlaskConicalOff size={14} /></button>
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
        anchor={snoozeAnchor}
        onPick={(until) => {
          snoozePickerFor = null;
          snoozeAnchor = null;
          snoozeThread(thread, until);
        }}
        onClose={() => {
          snoozePickerFor = null;
          snoozeAnchor = null;
        }}
      />
    {/if}
  </div>
{/snippet}

{#snippet collapsible(key: string, label: string, list: Thread[], variant: "snoozed" | "toTest" | "archived")}
  {#if list.length > 0}
    {@const doneAutos = isDoneKey(key)}
    <button
      class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] text-fainter hover:text-muted"
      onclick={() => toggle(key)}
    >
      {#if expanded[key]}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
      {label} · {list.length}
    </button>
    <div
      class="done-panel"
      class:done-panel--open={expanded[key]}
      class:done-panel--animated={!reduceMotion}
      onpointerenter={() => doneAutos && expanded[key] && clearDoneHide(key)}
      onpointerleave={() => doneAutos && expanded[key] && startDoneHide(key)}
    >
      <div class="done-panel__inner">
        {#if expanded[key]}
          <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active">
            {#each list as thread (thread.id)}
              {@render threadRow(thread, variant)}
            {/each}
          </MovingHighlight>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<svelte:window
  onkeydown={onPreviewKeydown}
  onkeyup={onPreviewKeyup}
  onblur={() => (previewThreadId = null)}
/>

<aside
  class="flex h-full shrink-0 flex-col"
  style="width: {width}px"
>
  <!-- Search badge rides up into the titlebar strip, right-aligned to sit
       next to the page content. It's a launcher (opens ⌘K), not an input —
       kept as a compact icon + shortcut hint. Top-aligned with the page
       content card (mt-2 = 8px); the rest of the strip stays a drag region.
       Strip height clears the traffic lights (via --titlebar-content-top,
       set at boot from the native config) and divides by --zoom-factor so
       the gap stays constant under content zoom. -->
  <div
    class="titlebar-drag relative shrink-0"
    style="height: calc(var(--titlebar-content-top, 40px) / var(--zoom-factor, 1))"
  >
    <div class="absolute right-3 top-2 flex items-center gap-1">
      {#if extensionUi.extUpdates.length > 0}
        <button
          bind:this={extUpdatesAnchor}
          class="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-amber-400 hover:bg-surface-2 {extUpdatesOpen ? 'bg-surface-2' : ''}"
          onclick={() => { extUpdatesOpen = !extUpdatesOpen; }}
          data-testid="nav-ext-updates"
          title="{extensionUi.extUpdates.length} extension update{extensionUi.extUpdates.length === 1 ? '' : 's'} available: {extensionUi.extUpdates.join(', ')}"
        >
          <BellRing size={14} />
          <span class="num-badge num-badge--accent">{extensionUi.extUpdates.length}</span>
        </button>
      {/if}
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
        onclick={() => { playRotary(); feedbackOpen = true; }}
        data-testid="nav-feedback"
        data-press="self"
        title="Send feedback"
      >
        <Megaphone size={15} />
      </button>
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        onclick={() => { playRotary(); onGoBack(); }}
        disabled={!canGoBack}
        data-testid="nav-back"
        data-press="self"
        title="Back (⌘[)"
      >
        <ArrowLeft size={15} />
      </button>
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        onclick={() => { playRotary(); onGoForward(); }}
        disabled={!canGoForward}
        data-testid="nav-forward"
        data-press="self"
        title="Forward (⌘])"
      >
        <ArrowRight size={15} />
      </button>
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        onclick={reloadAll}
        disabled={reloading}
        data-testid="nav-reload-all"
        title="Reload extensions/skills/prompts in all sessions"
      >
        <RotateCw size={15} class={reloading ? "animate-spin" : ""} />
      </button>
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
        onclick={onOpenSearch}
        data-testid="nav-search"
        title="Search (⌘K)"
      >
        <Search size={15} /><kbd class="text-[10px] text-fainter">⌘K</kbd>
      </button>
    </div>
  </div>

  {#if extUpdatesOpen}
    <ExtUpdatesPopover
      anchor={extUpdatesAnchor}
      onClose={() => (extUpdatesOpen = false)}
      onManage={() => { extUpdatesOpen = false; onOpenView("extensions"); }}
    />
  {/if}

  <!-- Nav -->
  <nav class="px-3 pb-2">
    <MovingHighlight
      class="flex flex-col gap-0.5 moving-highlight--nav"
      itemSelector=".main-nav-item"
      activeSelector=".main-nav-item--active"
    >
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'automations' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("automations")}
        data-testid="nav-automations"
      >
        <span class="flex items-center gap-2.5"><AlarmClock size={15} /> Automations</span>
        {#if automationCount > 0}
          <span class="num-badge" data-testid="automations-badge">{automationCount}</span>
        {/if}
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
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'connections' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("connections")}
        data-testid="nav-connections"
      >
        <span class="flex items-center gap-2.5"><Plug size={15} /> Connections</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'bws' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("bws")}
        data-testid="nav-bws"
      >
        <span class="flex items-center gap-2.5"><KeyRound size={15} /> Secrets</span>
      </button>
      <button
        class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
          {activeView === 'remote' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
        onclick={() => onOpenView("remote")}
        data-testid="nav-remote"
        data-remote-first={remoteFirst ? "on" : undefined}
      >
        <span class="flex items-center gap-2.5 {remoteFirst ? 'remote-first-pulse' : ''}">
          <Radio size={15} /> Remote
        </span>
      </button>
      <div
        class="main-nav-item--usage relative"
        data-nav-usage-host
      >
        <button
          bind:this={usageAnchor}
          class="main-nav-item flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-fg"
          onclick={toggleUsagePopover}
          data-testid="nav-usage"
        >
          <span class="flex items-center gap-2.5"><Gauge size={15} /> Usage</span>
          {#if featuredLine.length > 0}
            <span class="flex items-center gap-1.5 text-[10px] text-fainter" data-testid="nav-usage-line">
              {#each featuredLine as { provider, key, m } (provider + key)}
                <span>
                  <span class="text-fainter">{shortTag(provider)}</span>
                  <span class="ml-0.5 {urgencyClass(m.urgency)}">{m.remainingPct !== null && m.remainingPct <= 0 ? `${fmtResetsIn(m.resetAt, now)} left` : m.value}</span>
                </span>
              {/each}
            </span>
          {/if}
        </button>
        {#if usageOpen}
          <UsagePopover anchor={usageAnchor} onClose={() => (usageOpen = false)} />
        {/if}
      </div>
    </MovingHighlight>
  </nav>

  <!-- Projects -->
  <div class="flex items-center justify-between px-4 pt-2 pb-1.5">
    <span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase {activeProjectId ? 'engraved--active' : ''}"><Folder size={12} /> Projects</span>
    <Tooltip text="Add project">
      <button
        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
        onclick={() => api.invoke("projects:pick")}
        data-testid="add-project"><Plus size={15} /></button
      >
    </Tooltip>
  </div>
  <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-2" style="scrollbar-gutter: stable">
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
          </button>
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <Tooltip text="Add thread to master">
              <button
                class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
                onclick={() => newThread(group.project.id)}
                data-testid="new-thread"
                aria-label="Add thread"><Plus size={14} /></button
              >
            </Tooltip>
            <Tooltip text="New worktree — seeded from a copy of your current changes, main checkout is left untouched">
              <button
                class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
                onclick={() => newWorktree(group.project.id)}
                data-testid="new-worktree-thread"><GitBranchPlus size={14} /></button
              >
            </Tooltip>
            <Tooltip text="Remove project">
              <button
                class="rounded p-1 text-faint hover:bg-surface-2 hover:text-danger"
                onclick={() => removeProject(group.project)}
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
                    {isCollapsed(group.project.id) ? 'opacity-0 group-hover:opacity-100' : ''}
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
                    {isCollapsed(group.project.id) ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}
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
                    {isCollapsed(group.project.id) ? 'opacity-0 group-hover:opacity-100' : ''}
                    {snoozedPopoverFor === group.project.id ? 'text-accent' : 'text-faint hover:text-fg'}"
                  data-snooze-list-toggle
                  onclick={(e) => {
                    snoozedPopoverFor =
                      snoozedPopoverFor === group.project.id ? null : group.project.id;
                    snoozedListAnchor = snoozedPopoverFor ? e.currentTarget : null;
                  }}
                  data-testid="project-snoozed"
                  aria-label="Snoozed threads"><Clock size={14} /><span>{group.snoozed.length}</span></button
                >
              </Tooltip>
              {#if snoozedPopoverFor === group.project.id}
                <SnoozedPopover
                  anchor={snoozedListAnchor}
                  threads={group.snoozed}
                  onSelect={(id) => selectThread(id)}
                  onUnsnooze={(id) => void api.invoke("threads:unsnooze", id)}
                  onClose={() => {
                    snoozedPopoverFor = null;
                    snoozedListAnchor = null;
                  }}
                />
              {/if}
            </div>
          {/if}
          {#if group.toTest.length > 0}
            <Tooltip text="Open testing area">
              <button
                class="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px]
                  {isCollapsed(group.project.id) ? 'opacity-0 group-hover:opacity-100' : ''}
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
          class:done-panel--open={!isCollapsed(group.project.id)}
          class:done-panel--animated={!reduceMotion}
        >
          <div class="done-panel__inner--grow">
          <!-- Local (project main checkout). Renders flat; no extra
               header layer — worktrees get their own section below. -->
          <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
            {#each group.masterActive as thread (thread.id)}
              {@render threadRow(thread, "active")}
            {/each}
          </MovingHighlight>

          {#if group.worktreeFlatActive.length > 0 || group.worktreeNested.length > 0}
            <!-- Worktrees section. Tinted to distinguish from local.
                 Single-thread worktrees render as flat tinted rows;
                 ≥2 threads collapse under a nested header. -->
            <div class="worktrees-section" role="group" aria-label="Worktrees">
              <div class="worktrees-section__label">
                <GitBranch size={11} class="shrink-0 text-accent/70" />
                <span>Worktrees</span>
                {#if group.worktreeFlatActive.length + group.worktreeNested.reduce((n, wg) => n + wg.active.length, 0) > 0}
                  <span class="text-fainter">· {group.worktreeFlatActive.length + group.worktreeNested.reduce((n, wg) => n + wg.active.length, 0)}</span>
                {/if}
              </div>

              <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
                {#each group.worktreeFlatActive as thread (thread.id)}
                  {@const wg = group.worktreeFlat.find((w) => w.active[0]?.id === thread.id)}
                  {@render threadRow(thread, "active", wg?.worktree.name)}
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
                        onclick={() => newThread(group.project.id, wg.worktree.id)}
                        aria-label="Add thread to worktree"><Plus size={12} /></button
                      >
                    </Tooltip>
                    <Tooltip text="Archive worktree and its threads">
                      <button
                        class="rounded p-0.5 text-fainter hover:bg-surface-2 hover:text-danger"
                        onclick={() => archiveWorktree(wg.worktree)}
                        aria-label="Archive worktree"><Archive size={12} /></button
                      >
                    </Tooltip>
                  </div>
                </div>
                <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
                  {#each wg.active as thread (thread.id)}
                    {@render threadRow(thread, "active")}
                  {/each}
                </MovingHighlight>
              {/each}
            </div>
          {/if}

          {@render collapsible(`ar:${group.project.id}`, "Done", group.archived, "archived")}
          </div>
        </div>
      </div>
    {:else}
      <p class="px-2 text-xs text-fainter">No projects yet. Add one with +.</p>
    {/each}
  </nav>

  <!-- Chats -->
  <div class="border-t border-border/60 px-3 pt-3 pb-3">
    <div class="flex items-center justify-between px-1 pb-1.5">
      <span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase {chatActive ? 'engraved--active' : ''}"><MessageSquare size={12} /> Chats</span>
      <button
        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
        onclick={newChat}
        data-testid="new-chat"
        title="New chat"><Plus size={14} /></button
      >
    </div>
    <div class="chats-scroll max-h-48 overflow-y-auto">
      <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
        {#each chatGroups.active as thread (thread.id)}
          {@render threadRow(thread, "active")}
        {/each}
      </MovingHighlight>
      {@render collapsible("chats:past", "Done", chatGroups.archived, "archived")}
    </div>
  </div>

  <!-- Remote masters: threads watched on another machine (ADR-0009/0010) -->
  {#each remoteGroups as group (group.id)}
    <div class="border-t border-border/60 px-3 pt-3 pb-3">
      <div class="flex items-center justify-between px-1 pb-1.5">
        <span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
          <Radio size={12} /> {group.name}
        </span>
      </div>
      <div class="max-h-64 overflow-y-auto">
        {#each group.projects as proj (proj.name)}
          <div class="px-1.5 pt-1 pb-0.5 text-[10px] font-medium tracking-wide text-fainter uppercase">{proj.name}</div>
          <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" {previewSelector}>
            {#each proj.threads as thread (thread.id)}
              {@render threadRow(thread, "active")}
            {/each}
          </MovingHighlight>
        {/each}
      </div>
    </div>
  {/each}
</aside>

<ConfirmDialog
  bind:open={archiveDialogOpen}
  title="Archive worktree"
  description={archiveWorktreeDescription}
  confirmLabel="Archive"
  destructive
  onConfirm={confirmArchiveWorktree}
/>

<ConfirmDialog
  bind:open={removeProjectDialogOpen}
  title="Remove project"
  description={removeProjectDescription}
  confirmLabel="Remove"
  destructive
  onConfirm={confirmRemoveProject}
/>

<ConfirmDialog
  bind:open={archiveSoleWorktreeDialogOpen}
  title="Archive thread and worktree?"
  description="This is the only thread in its worktree, so archiving it removes the worktree's git checkout too. This can't be undone."
  confirmLabel="Archive thread + worktree"
  destructive
  dontShowAgainLabel="Don't warn me about this"
  onConfirm={(dontShowAgain) => confirmArchiveSoleWorktreeThread(dontShowAgain)}
/>

<FeedbackDialog bind:open={feedbackOpen} />

<style>
  /* Nav buttons are mouse/keyboard-activated, not tab-stopped — the
     global :focus-visible ring would otherwise linger on the clicked
     item (Chromium keeps :focus-visible after a click reached from
     keyboard focus). Suppress it here; the active state is already
     shown via .main-nav-item--active. */
  .main-nav-item:focus-visible {
    outline: none;
  }

  /* ── worktrees section: tinted container distinguishing worktree
     threads from local master. Single-thread worktrees render flat
     inside; ≥2 threads collapse under a .worktree-header. ───────── */
  .worktrees-section {
    margin-top: 4px;
    /* Horizontal inset keeps rows (and the MovingHighlight active box,
       which measures them) clear of the section's left accent stripe and
       its 6px rounded corners; otherwise the selected-row grey box covers
       the stripe and its 8px corners clash with the section radius. */
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

  /* ── per-variant card pop (hero motion) ────────────────────────── */
  :global(.session-row.done-pop) { transform-origin: center; }

  /* v0 Precision archive slide — press → metallic glint sweep → slide,
     fade & collapse toward the Done section. Tuned for the premium
     metallic theme: a narrow white sheen rakes across the row (screen
     blend reads as polished metal), no particles. */
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
    /* press (≈80ms) */
    0%   { transform: translateY(0) scale(1);     box-shadow: none; }
    16%  { transform: translateY(0) scale(0.985); box-shadow: inset 0 1px 2px oklch(0 0 0 / 0.28); }
    24%  { transform: translateY(0) scale(0.992); box-shadow: none; }
    /* glint passes here; row holds full height (move/fade ≈220ms) */
    62%  { transform: translateY(8px) scale(0.99);  opacity: 0.28; max-height: 2.4rem; }
    70%  { transform: translateY(10px) scale(0.985); opacity: 0.06; max-height: 2.4rem;
           padding-top: 0.375rem; padding-bottom: 0.375rem; margin-top: 0; margin-bottom: 0; }
    /* height collapse (≈120ms) */
    100% { transform: translateY(10px) scale(0.985); opacity: 0; max-height: 0;
           padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
  }
  @keyframes archive-glint {
    0%   { transform: translateX(-130%); opacity: 0; }
    25%  { opacity: 1; }
    100% { transform: translateX(130%);  opacity: 0; }
  }

  /* v0b Archive swipe — juicier: snappier press, longer lateral throw with
     a slight tilt, brighter/faster glint, crisp collapse. */
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

  /* v0c Archive shing — high juice: twin glints cross + a whole-row
     brightness flash (the "filed" chrome ping), then a crisp collapse. */
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

  /* v0d Archive vacuum — extreme: the row gets sucked toward the Done
     section: scaleX squash + skew + motion-blur streak, then collapse. */
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

  /* ── Mark-to-test animation (testBench) ──────────────────────────
     press → row tightens → amber/blue calibration scan sweeps across →
     TEST badge imprints (stamp veil flash) → row settles into a dimmed
     testing state (no slide toward Done; brief downward nudge only).
     Mirrors the archive family: effect carried on the row itself; the
     burst overlay renders nothing. */
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
    /* thin amber/blue calibration scan line */
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
    /* stamp imprint veil — amber inset ring + flash */
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
  /* grid 1fr/0fr animates height natively (no per-frame measuring,
     so no text-reflow jitter); opacity + small settle soften the cut. */
  .done-panel {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
  }
  .done-panel--animated {
    transition:
      grid-template-rows 200ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms ease;
  }
  .done-panel--open {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  .done-panel__inner {
    min-height: 0;
    overflow-y: auto;
    /* Cap so the accordion only ever grows to a bounded height; long Done
       lists scroll inside instead of inflating the panel to thousands of
       px (which made the open transition read as an instant flash). */
    max-height: 16rem;
    /* Hide the scrollbar: during the 0fr↔1fr grid transition the animating
       row is shorter than content, so a vertical scrollbar flashes in/out,
       shifting right-aligned timestamps (snooze countdowns). Long lists
       still scroll via wheel/trackpad; the parent nav shows its own bar. */
    scrollbar-width: none;
  }
  .done-panel__inner::-webkit-scrollbar { display: none; }
  /* Chats list: same scrollbar-hide guard as .done-panel__inner. When a chat
     is archived or a new one is added, the .done-panel grid transition (and
     the height change of the list itself) momentarily overflows this 12rem
     cap, flashing vertical + horizontal scrollbars. Hide them; long lists
     still scroll via wheel/trackpad and overflow-x is clamped. */
  .chats-scroll {
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .chats-scroll::-webkit-scrollbar { display: none; }
  /* Uncapped variant for the project body: threads live in the sidebar's
     scroll container, so the panel must grow to fit (no nested scroll). */
  .done-panel__inner--grow {
    min-height: 0;
    overflow: hidden;
  }
</style>
