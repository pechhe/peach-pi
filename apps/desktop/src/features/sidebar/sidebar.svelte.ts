import type { AppView, Project, Thread, Worktree } from "@peach-pi/shared-types";
import { isNewThread } from "@peach-pi/shared-types";
import { SvelteSet } from "svelte/reactivity";
import { api } from "../../lib/ipc";
import { extensionUi } from "../../stores/extension-ui.svelte";
import { snapshot } from "../../stores/snapshot.svelte";
import { FLEET_WIDGET_KEY, parseFleet } from "../../lib/subagent/fleet";
import { playRotary, playButtonSecondary } from "../../lib/sound/button-click-sound";
import { playArchiveSound } from "../../lib/sound/done-sound";
import { playTestSound } from "../../lib/sound/test-sound";

/** A worktree + its non-archived active threads, for sidebar grouping. */
export interface WorktreeGroup {
  worktree: Worktree;
  active: Thread[];
}

/** One project's sidebar grouping: its partitioned threads plus the
 *  worktree splits (flat single-thread rows vs nested ≥2-thread headers). */
export interface ProjectListGroup {
  project: Project;
  active: Thread[];
  snoozed: Thread[];
  toTest: Thread[];
  archived: Thread[];
  masterActive: Thread[];
  worktreeFlat: WorktreeGroup[];
  worktreeFlatActive: Thread[];
  worktreeNested: WorktreeGroup[];
}

/**
 * Sidebar view-model + actions, extracted from `Sidebar.svelte`. Owns the
 * derived thread groupings (projects / chats / remote masters), the
 * transient row UI state (preview traversal, done/test animations, snooze
 * pickers, drag-reorder, archiving hide-set), and the reversible thread
 * actions (archive / mark-to-test / snooze + their undo toasts).
 *
 * The shell (`Sidebar.svelte`) mirrors its props into this store each render
 * and renders per-concern child components that read from it. All main-process
 * calls stay on the typed IPC seam (`api.invoke`); the renderer never touches
 * Node APIs.
 *
 * Singleton: the app renders a single sidebar for its lifetime, so a module
 * instance is safe (mirrors `extensionUi` / `snapshot`).
 */
class SidebarStore {
  // ── inputs (mirrored from Sidebar.svelte props each render) ──────────
  projects = $state<Project[]>([]);
  worktrees = $state<Worktree[]>([]);
  threads = $state<Thread[]>([]);
  selectedThreadId = $state<string | null>(null);
  activeView = $state<AppView>("new-thread");
  collapsedProjects = $state<string[]>([]);

  // Host callbacks (non-reactive; invoked by actions below).
  onSelect: (threadId: string) => void = () => {};
  onNewThread: (projectId: string, worktreeId?: string) => void = () => {};
  onNewWorktree: (projectId: string) => void = () => {};
  onNewChat: () => void = () => {};

  // ── transient row UI state ───────────────────────────────────────────
  expanded = $state<Record<string, boolean>>({});
  snoozePickerFor = $state<string | null>(null);
  snoozeAnchor: HTMLElement | null = $state(null);
  snoozedPopoverFor = $state<string | null>(null);
  snoozedListAnchor: HTMLElement | null = $state(null);
  doneAnimFor = $state<string | null>(null);
  // Mirrors doneAnimFor: the row holds its end-state until the real
  // threads:markToTest snapshot lands, so it doesn't spring back for the
  // gap frames.
  testAnimFor = $state<string | null>(null);
  // Ids whose archive animation has finished but whose archived snapshot
  // hasn't landed yet. Filtered out of the active lists so the row leaves
  // the DOM at its collapsed end-state instead of springing back to full
  // height until the async threads:archive snapshot arrives.
  archivingIds = $state(new SvelteSet<string>());

  // ⌘⇧↑/↓ traversal: while the modifiers are held the highlight "hovers" a
  // thread without selecting it; releasing ⌘ or ⇧ "clicks" the previewed row.
  previewThreadId = $state<string | null>(null);

  // Sidebar drag-reorder of projects (native HTML5 DnD).
  draggedId = $state<string | null>(null);
  dragOverId = $state<string | null>(null);

  // Clock for relative timestamps + usage reset countdowns. Ticked by the
  // shell (effects can't run in a `.svelte.ts` module).
  now = $state(Date.now());

  // Auto-hide for "Done" dropdowns only: collapse after DONE_HIDE_MS of no
  // pointer interaction. Cancel-while-hovered, restart-on-leave. Plain
  // (non-reactive) record; cleared by a shell teardown effect.
  readonly DONE_HIDE_MS = 10_000;
  readonly reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  doneHideTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // ── derived view-model ───────────────────────────────────────────────
  chats = $derived(this.threads.filter((t) => t.projectId === null && !t.remoteHostId));

  // Threads mirrored from remote masters, grouped per host → per project so
  // they nest under the master's real project names (each row is also tagged
  // remote).
  remoteGroups = $derived.by(() => {
    const byHost = new Map<string, { name: string; projects: Map<string, Thread[]> }>();
    for (const t of this.threads) {
      if (!t.remoteHostId) continue;
      const h = byHost.get(t.remoteHostId) ?? { name: t.remoteHostName ?? "Remote", projects: new Map<string, Thread[]>() };
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

  byProject = $derived<ProjectListGroup[]>(
    this.projects.map((p) => {
      const projThreads = this.threads.filter((t) => t.projectId === p.id);
      const parts = this.partition(projThreads);
      const projWorktrees = this.worktrees.filter((w) => w.projectId === p.id && !w.archivedAt);
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
      return { project: p, ...parts, masterActive, worktreeFlat, worktreeFlatActive, worktreeNested } satisfies ProjectListGroup;
    }),
  );

  chatGroups = $derived(this.partition(this.chats));

  // Thread IDs with at least one still-running background subagent, per the
  // pi-subagents "subagent-status" widget feed. A `later_message` helper
  // returns before its work is done, so the parent thread's status flips to
  // "completed" while the child is still active — the sidebar spinner would
  // otherwise vanish mid-run. Keep it spinning while the fleet feed reports
  // live agents.
  fleetActiveIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const [threadId, map] of extensionUi.widgetEntries()) {
      const lines = map.get(FLEET_WIDGET_KEY);
      if (lines && parseFleet(lines)?.count) ids.add(threadId);
    }
    return ids;
  });

  // The project the active thread belongs to (null for chats / non-thread
  // views). Drives the Projects section label glow.
  activeProjectId = $derived(
    this.activeView === "thread" && this.selectedThreadId
      ? this.threads.find((t) => t.id === this.selectedThreadId)?.projectId ?? null
      : null,
  );
  // True when the selected thread is a project-less chat — drives the Chats
  // section label glow (mirrors the Projects label for project threads).
  chatActive = $derived(
    this.activeView === "thread" && this.selectedThreadId !== null && this.activeProjectId === null,
  );

  // Flat, top-to-bottom order of the rows ⌘⇧↑/↓ can land on: every visible
  // active row (master threads, then each worktree's threads, per project;
  // then chats). Collapsed groups (snoozed/to-test/past) are excluded.
  previewOrder = $derived([
    ...this.byProject
      .filter((g) => !this.isCollapsed(g.project.id))
      .flatMap((g) => [...g.masterActive, ...g.worktreeFlatActive, ...g.worktreeNested.flatMap((wg) => wg.active)]),
    ...this.chatGroups.active,
  ].map((t) => t.id));

  previewSelector = $derived(
    this.previewThreadId ? `.session-row[data-thread-id="${this.previewThreadId}"]` : "",
  );

  // The warning-dismissal flag gates the sole-thread-worktree confirm.
  archiveSoleWorktreeWarningDismissed = $derived(
    snapshot.current?.ui.archiveThreadWorktreeWarningDismissed ?? false,
  );

  // ── dialog state + descriptions (hosted in the shell) ────────────────
  pendingArchiveWorktree = $state<Worktree | null>(null);
  archiveDialogOpen = $state(false);
  pendingRemoveProject = $state<Project | null>(null);
  removeProjectDialogOpen = $state(false);
  pendingArchiveSoleWorktreeThread = $state<Thread | null>(null);
  archiveSoleWorktreeDialogOpen = $state(false);

  pendingArchiveWorktreeName = $derived(this.pendingArchiveWorktree?.name ?? "");
  archiveWorktreeDescription = $derived(
    `“${this.pendingArchiveWorktreeName}” and all its threads will be archived, and the checkout removed.`,
  );
  removeProjectDescription = $derived(
    this.pendingRemoveProject
      ? `Remove project "${this.pendingRemoveProject.name}" and all its threads? This can't be undone.`
      : "",
  );

  // ── methods ──────────────────────────────────────────────────────────
  relativeTime(iso: string, ref: number): string {
    const m = Math.floor((ref - new Date(iso).getTime()) / 60_000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  isCollapsed(projectId: string): boolean {
    return this.collapsedProjects.includes(projectId);
  }
  toggleCollapse(project: Project) {
    void api.invoke("projects:setCollapsed", project.id, !this.isCollapsed(project.id));
  }

  partition(list: Thread[]) {
    return {
      // A thread that just woke from snooze (wokeFromSnoozeAt set) pins to
      // the very top of the active area, above the usual activity order.
      // Cleared once the thread is opened (markSeen in repositories.ts).
      active: list
        .filter((t) => !t.archivedAt && !t.snoozedUntil && !t.toTestAt && !this.archivingIds.has(t.id))
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

  isDoneKey(key: string): boolean {
    return key.startsWith("ar:") || key === "chats:past";
  }

  startDoneHide(key: string) {
    if (!this.isDoneKey(key)) return;
    this.clearDoneHide(key);
    this.doneHideTimers[key] = setTimeout(() => this.toggle(key, false), this.DONE_HIDE_MS);
  }

  clearDoneHide(key: string) {
    const t = this.doneHideTimers[key];
    if (t) {
      clearTimeout(t);
      delete this.doneHideTimers[key];
    }
  }

  toggle(key: string, value?: boolean) {
    const next = value ?? !this.expanded[key];
    this.expanded = { ...this.expanded, [key]: next };
    if (next) this.startDoneHide(key);
    else this.clearDoneHide(key);
  }

  selectThread(id: string) {
    playRotary();
    this.onSelect(id);
  }

  // ── project drag-reorder ─────────────────────────────────────────────
  onProjectDragStart(project: Project, e: DragEvent) {
    this.draggedId = project.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", project.id);
    }
  }
  onProjectDragOver(project: Project, e: DragEvent) {
    if (!this.draggedId || this.draggedId === project.id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    this.dragOverId = project.id;
  }
  onProjectDrop(project: Project, e: DragEvent) {
    e.preventDefault();
    if (this.draggedId && this.draggedId !== project.id) {
      const ids = this.projects.map((p) => p.id);
      const from = ids.indexOf(this.draggedId);
      const to = ids.indexOf(project.id);
      if (from !== -1 && to !== -1) {
        const next = ids.slice();
        next.splice(from, 1);
        next.splice(to, 0, this.draggedId);
        void api.invoke("projects:reorder", next);
      }
    }
    this.draggedId = null;
    this.dragOverId = null;
  }
  onProjectDragEnd() {
    this.draggedId = null;
    this.dragOverId = null;
  }

  // ── new thread / worktree / chat ─────────────────────────────────────
  newThread(projectId: string, worktreeId?: string) {
    playButtonSecondary("click");
    this.onNewThread(projectId, worktreeId);
  }
  newWorktree(projectId: string) {
    playButtonSecondary("click");
    this.onNewWorktree(projectId);
  }

  // ── worktree archive confirm ─────────────────────────────────────────
  archiveWorktree(worktree: Worktree) {
    this.pendingArchiveWorktree = worktree;
    this.archiveDialogOpen = true;
  }
  confirmArchiveWorktree() {
    const worktree = this.pendingArchiveWorktree;
    if (!worktree) return;
    void api.invoke("worktrees:archive", worktree.id);
    this.pendingArchiveWorktree = null;
    this.archiveDialogOpen = false;
  }

  // ── remove project confirm ───────────────────────────────────────────
  removeProject(project: Project) {
    // projects:remove cascades to all the project's threads (ON DELETE CASCADE).
    this.pendingRemoveProject = project;
    this.removeProjectDialogOpen = true;
  }
  confirmRemoveProject() {
    if (this.pendingRemoveProject) void api.invoke("projects:remove", this.pendingRemoveProject.id);
    this.pendingRemoveProject = null;
    this.removeProjectDialogOpen = false;
  }

  // ── reversible thread actions ────────────────────────────────────────
  /** Non-archived siblings of the thread's worktree (excluding the thread
   *  itself). When empty, archiving this thread would orphan the worktree. */
  soleThreadInWorktree(thread: Thread): boolean {
    if (!thread.worktreeId) return false;
    const siblings = this.threads.filter(
      (t) => t.worktreeId === thread.worktreeId && !t.archivedAt && t.id !== thread.id,
    );
    return siblings.length === 0;
  }

  private nextAfter(threadId: string): string | null {
    const idx = this.previewOrder.indexOf(threadId);
    return idx !== -1 ? (this.previewOrder[idx + 1] ?? this.previewOrder[idx - 1] ?? null) : null;
  }

  archiveThread(thread: Thread) {
    if (isNewThread(thread.title)) {
      const nextId = this.nextAfter(thread.id);
      void api.invoke("threads:delete", thread.id);
      if (nextId && thread.id === this.selectedThreadId) this.onSelect(nextId);
      return;
    }
    // Sole-thread worktree: archive both thread + worktree. Non-reversible,
    // so gate on an explicit confirm unless the user opted out.
    if (this.soleThreadInWorktree(thread)) {
      this.pendingArchiveSoleWorktreeThread = thread;
      if (this.archiveSoleWorktreeWarningDismissed) {
        this.confirmArchiveSoleWorktreeThread(false);
      } else {
        this.archiveSoleWorktreeDialogOpen = true;
      }
      return;
    }
    playArchiveSound();
    this.doneAnimFor = thread.id;
  }

  confirmArchiveSoleWorktreeThread(dontShowAgain: boolean | undefined) {
    const thread = this.pendingArchiveSoleWorktreeThread;
    if (!thread) return;
    if (dontShowAgain) {
      void api.invoke("ui:setArchiveThreadWorktreeWarningDismissed", true);
    }
    // Pick the next thread below before this one leaves the list, so the
    // view advances instead of landing on nothing.
    const nextId = this.nextAfter(thread.id);
    this.archivingIds.add(thread.id);
    // worktrees:archive tears down the worktree AND archives every thread in
    // it (AppService.archive), so this single call covers both rows.
    if (thread.worktreeId) void api.invoke("worktrees:archive", thread.worktreeId);
    if (nextId && thread.id === this.selectedThreadId) this.onSelect(nextId);
    this.pendingArchiveSoleWorktreeThread = null;
    this.archiveSoleWorktreeDialogOpen = false;
  }

  finishArchive(thread: Thread) {
    // Pick the next thread below before this one leaves the list, so the
    // view advances instead of landing on nothing.
    const nextId = this.nextAfter(thread.id);
    // Hide the row locally *before* clearing doneAnimFor so it unmounts at
    // its collapsed end-state — clearing the class alone would spring the
    // row back to full height until the async archive snapshot lands.
    this.archivingIds.add(thread.id);
    if (this.doneAnimFor === thread.id) this.doneAnimFor = null;
    void api.invoke("threads:archive", thread.id);
    if (nextId && thread.id === this.selectedThreadId) this.onSelect(nextId);
    extensionUi.notify(`Archived “${thread.title || "Untitled"}”`, {
      label: "Undo",
      run: () => void api.invoke("threads:unarchive", thread.id),
    });
  }

  markThreadToTest(thread: Thread) {
    playTestSound();
    this.testAnimFor = thread.id;
  }

  finishMarkToTest(thread: Thread) {
    const nextId = this.nextAfter(thread.id);
    this.testAnimFor = this.testAnimFor === thread.id ? null : this.testAnimFor;
    void api.invoke("threads:markToTest", thread.id);
    if (nextId && thread.id === this.selectedThreadId) this.onSelect(nextId);
    extensionUi.notify(`Moved “${thread.title || "Untitled"}” to testing`, {
      label: "Undo",
      run: () => void api.invoke("threads:unmarkToTest", thread.id),
    });
  }

  snoozeThread(thread: Thread, until: string) {
    void api.invoke("threads:snooze", thread.id, until);
    extensionUi.notify(`Snoozed “${thread.title || "Untitled"}”`, {
      label: "Undo",
      run: () => void api.invoke("threads:unsnooze", thread.id),
    });
  }

  // ── ⌘⇧↑/↓ preview traversal ──────────────────────────────────────────
  movePreview(dir: 1 | -1) {
    const list = this.previewOrder;
    if (list.length === 0) return;
    const cur = this.previewThreadId ?? this.selectedThreadId;
    let idx = cur ? list.indexOf(cur) : -1;
    if (idx === -1) idx = dir === 1 ? -1 : 0;
    idx = (idx + dir + list.length) % list.length;
    const next = list[idx];
    if (!next) return;
    this.previewThreadId = next;
    // Keep the previewed row on screen as the highlight travels.
    requestAnimationFrame(() => {
      document
        .querySelector(`.session-row[data-thread-id="${this.previewThreadId}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  onPreviewKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.movePreview(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.movePreview(-1);
    }
  }

  onPreviewKeyup(e: KeyboardEvent) {
    if (this.previewThreadId === null) return;
    // Releasing either modifier commits the preview — "let go" = click.
    if (e.key === "Meta" || e.key === "Control" || e.key === "Shift") {
      const id = this.previewThreadId;
      this.previewThreadId = null;
      this.selectThread(id);
    }
  }
}

export const sidebarStore = new SidebarStore();
