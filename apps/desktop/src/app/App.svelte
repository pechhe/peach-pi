<script lang="ts">
  import { onMount } from "svelte";
  import type { AppView, Thread } from "@peach-pi/shared-types";
  import { consumeAborted } from "../lib/composer/abort-signal.svelte";
  import { TAG_META } from "../lib/tag-meta";
  import { api } from "../lib/ipc";
  import { snapshot } from "../stores/snapshot.svelte";
  import { transcripts } from "../stores/transcripts.svelte";
  import { queues } from "../stores/composer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { scopedModels } from "../stores/scoped-models.svelte";
  import { remoteFirst } from "../stores/remote-first.svelte";
  import { sideChat } from "../stores/side-chat.svelte";
  import { usage } from "../stores/usage.svelte";
  import { usagePrefs } from "../stores/usage-prefs.svelte";
  import { preloadSounds, installGlobalButtonPress } from "../lib/sound/button-click-sound";
  import { preloadDoneSamples } from "../lib/sound/done-sound";
  import { playDoneSound } from "../lib/sound/done-sound";
  import Sidebar from "./Sidebar.svelte";
  import ThreadView from "./ThreadView.svelte";
  import TerminalPane from "./TerminalPane.svelte";
  import { terminal } from "../stores/terminal.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import SettingsView from "./SettingsView.svelte";
  import SkillsView from "./SkillsView.svelte";
  import ExtensionsView from "./ExtensionsView.svelte";
  import AutomationsView from "./AutomationsView.svelte";
  import PlayroomView from "./PlayroomView.svelte";
  import RecordingBar from "./RecordingBar.svelte";
  import ConnectorsView from "./ConnectorsView.svelte";
  import BwsView from "./BwsView.svelte";
  import TestingView from "./TestingView.svelte";
  import WorkQueueView from "./WorkQueueView.svelte";
  import RemoteView from "./RemoteView.svelte";
  import ExtensionDialog from "./ExtensionDialog.svelte";
  import TerminalCustomOverlay from "./TerminalCustomOverlay.svelte";
  import ImageLightbox from "./ImageLightbox.svelte";
  import TextAttachmentViewer from "./TextAttachmentViewer.svelte";
  import SkillDialog from "./SkillDialog.svelte";
  import Toasts from "./Toasts.svelte";
  import SidePanel from "./SidePanel.svelte";
  import PiHealthBanner from "./PiHealthBanner.svelte";
  import { Agentation } from "sv-agentation";
  // After copying annotations, automatically exit inspect mode and collapse the toolbar.
  // The controller is internal, so we dispatch synthetic events to trigger its handlers.
  function handleAgentationCopy() {
    setTimeout(() => {
      // Close any open panel (settings, preview).
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      );
      // Toggle off inspect mode.
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'i',
          code: 'KeyI',
          metaKey: true,
          bubbles: true,
        }),
      );
      // Collapse the toolbar back to the pill.
      const toolbar = document.querySelector<HTMLElement>('.toolbar-shell.toolbar-expanded');
      toolbar?.click();
    }, 100);
  }

  const agentationProps = import.meta.env.DEV
    ? {
        workspaceRoot: null,
        includeComponentContext: true,
        includeComputedStyles: false,
        keyBindings: {
          inspect: 'Meta+I',
          copy: 'Meta+Shift+C',
          reset: 'Meta+Shift+R',
          open: 'Meta+Shift+O',
          delete: 'Meta+Shift+D',
        },
        onCopy: handleAgentationCopy,
      }
    : null;

  let selectedThreadId = $state<string | null>(null);
  let view = $state<AppView>("thread");
  // Per-project scope for views that are scoped to one project (Testing).
  let testingProjectId = $state<string | null>(null);
  let workQueueProjectId = $state<string | null>(null);

  // ── New thread ───────────────────────────────────────────────────────
  // Threads are created eagerly: clicking "new thread" makes a real thread (and
  // session) immediately and selects it. The composer is full from the start;
  // ThreadView centres it while the thread has no messages yet.
  async function startNewThread(projectId: string | null, worktree = false) {
    const thread =
      worktree && projectId
        ? await api.invoke("threads:create", projectId, { worktree: true })
        : projectId
          ? await api.invoke("threads:create", projectId)
          : await api.invoke("threads:createChat");
    selectThread(thread.id);
  }

  // Flip a not-yet-used thread between its project dir and an isolated worktree.
  // Done in place on the same thread id (no delete/recreate) so ThreadView
  // stays mounted and the composer draft survives — no flash.
  async function setThreadEnvironment(threadId: string, worktree: boolean) {
    await api.invoke("threads:setEnvironment", threadId, worktree);
  }
  let searchOpen = $state(false);
  let pendingFindQuery = $state<string | null>(null);
  // Settings search term handed in by the command palette ("Settings: Theme").
  let settingsQuery = $state("");

  // Sidebar width: seeded once from the persisted snapshot, then owned locally.
  // (Re-syncing on every snapshot would revert the drag, since the persisted
  //  value only catches up a tick after pointerup.)
  let sidebarWidth = $state(280);
  let widthSeeded = false;
  $effect(() => {
    if (widthSeeded) return;
    const w = snapshot.current?.ui.sidebarWidth;
    if (typeof w === "number") {
      sidebarWidth = w;
      widthSeeded = true;
    }
  });

  // Collapsed mode: the sidebar morphs from a flush rail into a floating card
  // that slides off-screen, leaving the content with an even margin. It slides
  // back in on left-edge hover. ⌘S toggles it (animated); choice is persisted.
  let sidebarCollapsed = $state(false);
  let collapsedSeeded = false;
  $effect(() => {
    if (collapsedSeeded) return;
    const c = snapshot.current?.ui.sidebarCollapsed;
    if (typeof c === "boolean") {
      sidebarCollapsed = c;
      collapsedSeeded = true;
    }
  });
  // Whether the floating sidebar is currently revealed by hover.
  let sidebarRevealed = $state(false);
  // Suppress slide/morph transitions while the user is dragging the resizer.
  let resizingSidebar = $state(false);
  // Content card node — used for the FLIP animation on ⌘S so the card's
  // resting layout stays real (centre-correct) and only the in-flight slide
  // is composited. Transformed only mid-animation, cleared at rest.
  let contentEl: HTMLDivElement | null = $state(null);
  let animatingContent = $state(false);

  // FLIP the content card from its previous (pre-toggle) box to its new one.
  // `margin-left` jumps to the resting value instantly (correct centre) and a
  // `transform` glide on the compositor eases the eye from old → new, then is
  // cleared so the card (and its fixed popovers) rest transform-free.
  // Translate only (no scaleX): scaling text/content reads as a smeary
  // stretch, so we keep the card at its new width and just glide the position.
  // The transition is armed only during the play (the `.sidebar-device--animating`
  // class) so the invert frame (none → translateX(dx)) is instant, not eased.
  function flipContentToRest(prevLeft: number) {
    const el = contentEl;
    if (!el) return;
    const next = el.getBoundingClientRect();
    const dx = prevLeft - next.left;
    if (!dx) return;
    el.style.transform = `translateX(${dx}px)`;
    // Two rAFs commit the invert frame, then arm the transition and play.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        animatingContent = true;
        el.style.transform = "translateX(0)";
      }),
    );
    const cleanup = () => {
      animatingContent = false;
      el.style.transform = "";
      el.removeEventListener("transitionend", onEnd);
      el.removeEventListener("transitioncancel", onEnd);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== "transform") return;
      cleanup();
    };
    el.addEventListener("transitionend", onEnd);
    el.addEventListener("transitioncancel", onEnd);
  }

  function toggleSidebarCollapsed() {
    const el = contentEl;
    const prevLeft = el ? el.getBoundingClientRect().left : null;
    sidebarCollapsed = !sidebarCollapsed;
    sidebarRevealed = false;
    void api.invoke("ui:setSidebarCollapsed", sidebarCollapsed);
    if (prevLeft != null) flipContentToRest(prevLeft);
  }

  // The content's left edge: flush against the sidebar when expanded, an even
  // margin (matching the card's other sides) when collapsed.
  const contentLeft = $derived(sidebarCollapsed ? 8 : sidebarWidth);
  // Expose it so overlays (including portaled dialogs) centre over the page
  // content rather than the whole window.
  $effect(() => {
    document.documentElement.style.setProperty("--content-left", `${contentLeft}px`);
  });
  function startSidebarResize(e: PointerEvent) {
    e.preventDefault();
    resizingSidebar = true;
    // If a FLIP glide is mid-flight, cancel it: no `transitionend` will fire
    // once transitions are suppressed, so clear the in-line transform by hand.
    animatingContent = false;
    if (contentEl) contentEl.style.transform = "";
    const startX = e.clientX;
    const startW = sidebarWidth;
    const move = (ev: PointerEvent) => {
      sidebarWidth = Math.min(560, Math.max(200, startW + (ev.clientX - startX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      resizingSidebar = false;
      void api.invoke("ui:setSidebarWidth", sidebarWidth);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const selectedThread = $derived(
    snapshot.current?.threads.find((t) => t.id === selectedThreadId) ?? null,
  );

  // Done sound + toast: any thread transitioning running → idle chimes once
  // and surfaces a toast; clicking it jumps to the thread.
  let lastStatuses = new Map<string, string>();
  $effect(() => {
    const threads = snapshot.current?.threads ?? [];
    for (const t of threads) {
      const prev = lastStatuses.get(t.id);
      if (prev === "running" && t.status === "completed" && !consumeAborted(t.id)) {
        playDoneSound();
        extensionUi.notify(
          `${t.title || "Thread"} finished`,
          { label: "View", run: () => selectThread(t.id) },
          "info",
          TAG_META[t.tag ?? "other"].icon,
        );
      }
      lastStatuses.set(t.id, t.status);
    }
  });

  // Snooze wake chime: when the main process auto-returns an expired snooze
  // to active it stamps wokeFromSnoozeAt; play the bell once on that
  // transition (set → carried until the thread is opened, which clears it).
  let lastWoke = new Map<string, boolean>();
  $effect(() => {
    const threads = snapshot.current?.threads ?? [];
    for (const t of threads) {
      const woke = !!t.wokeFromSnoozeAt;
      if (woke && !lastWoke.get(t.id)) playDoneSound("bell");
      lastWoke.set(t.id, woke);
    }
  });

  // ── Navigation history (⌘[ back · ⌘] forward) ───────────────────────
  type NavEntry = { view: AppView; threadId: string | null; projectId?: string | null };
  let navHistory = $state<NavEntry[]>([]);
  let navIndex = $state(-1);

  function applyNav(entry: NavEntry) {
    view = entry.view;
    selectedThreadId = entry.threadId;
    if (entry.view === "testing") testingProjectId = entry.projectId ?? null;
    if (entry.view === "work-queue") workQueueProjectId = entry.projectId ?? null;
    if (entry.threadId) void api.invoke("app:setSelectedThread", entry.threadId); // overlay prompt target
  }
  function pushNav(entry: NavEntry) {
    const cur = navHistory[navIndex];
    if (
      cur &&
      cur.view === entry.view &&
      cur.threadId === entry.threadId &&
      (cur.projectId ?? null) === (entry.projectId ?? null)
    )
      return;
    navHistory = [...navHistory.slice(0, navIndex + 1), entry];
    navIndex = navHistory.length - 1;
    applyNav(entry);
  }
  function goBack() {
    if (navIndex <= 0) return;
    navIndex -= 1;
    applyNav(navHistory[navIndex]!);
  }
  function goForward() {
    if (navIndex >= navHistory.length - 1) return;
    navIndex += 1;
    applyNav(navHistory[navIndex]!);
  }

  function selectThread(id: string, findQuery?: string) {
    pushNav({ view: "thread", threadId: id });
    if (findQuery) pendingFindQuery = findQuery;
  }
  function openView(v: AppView) {
    pushNav({ view: v, threadId: selectedThreadId });
  }
  function openTesting(projectId: string) {
    pushNav({ view: "testing", threadId: null, projectId });
  }
  function openWorkQueue(projectId: string) {
    pushNav({ view: "work-queue", threadId: null, projectId });
  }
  function openSettings(query = "") {
    settingsQuery = query;
    openView("settings");
  }

  // ⌘N starts a new thread in the current project (a new chat if none selected).
  function newThreadForCurrentProject() {
    startNewThread(selectedThread?.projectId ?? null);
  }

  // Sidebar new-thread button: create a thread in the project's main
  // checkout or inside an existing worktree (worktreeId set).
  async function newThreadInProject(projectId: string, worktreeId?: string) {
    const thread = await api.invoke(
      "threads:create",
      projectId,
      worktreeId ? { worktreeId } : undefined,
    );
    selectThread(thread.id);
  }

  // Sidebar git-branch-plus button: create a new worktree (registry record +
  // isolated git checkout) and open a fresh thread inside it.
  async function newWorktreeInProject(projectId: string) {
    const worktree = await api.invoke("worktrees:create", projectId);
    const thread = await api.invoke("threads:create", projectId, { worktreeId: worktree.id });
    selectThread(thread.id);
  }

  // Notification click in main → jump to thread.
  api.on("event:focusThread", (threadId) => selectThread(threadId));

  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      searchOpen = !searchOpen;
      return;
    }
    // ⌘, opens settings (macOS convention; preventDefault keeps the comma out of inputs).
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      openView("settings");
      return;
    }
    // ⌘[ / ⌘] navigate back / forward through visited views & threads.
    if ((e.metaKey || e.ctrlKey) && e.key === "[") {
      e.preventDefault();
      goBack();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "]") {
      e.preventDefault();
      goForward();
      return;
    }
    // ⌘N starts a new thread in the current project (or a new chat if none).
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      newThreadForCurrentProject();
      return;
    }
    // ⌘J toggles the terminal pane for the selected thread.
    if ((e.metaKey || e.ctrlKey) && e.key === "j") {
      e.preventDefault();
      terminal.toggle();
      return;
    }
    // ⌘S collapses/expands the sidebar (collapsed = reveal-on-hover).
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      toggleSidebarCollapsed();
      return;
    }
  }

  onMount(() => {
    transcripts.init();
    queues.init();
    sessionMetas.init();
    extensionUi.init();
    sideChat.init();
    usage.init();
    usagePrefs.init();
    scopedModels.init();
    remoteFirst.init();
    void snapshot.init();
    preloadSounds();
    preloadDoneSamples();
    return installGlobalButtonPress();
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

{#snippet sidebarBody()}
  <Sidebar
    width={sidebarWidth}
    projects={snapshot.current!.projects}
    worktrees={snapshot.current!.worktrees}
    threads={snapshot.current!.threads}
    automationCount={snapshot.current!.automations.length}
    collapsedProjects={snapshot.current!.ui.collapsedProjects}
    {selectedThreadId}
    activeView={view}
    onSelect={selectThread}
    remoteFirst={remoteFirst.mode.enabled}
    onNewChat={() => startNewThread(null)}
    onOpenView={openView}
    onOpenTesting={openTesting}
    onOpenWorkQueue={openWorkQueue}
    onNewThread={newThreadInProject}
    onNewWorktree={newWorktreeInProject}
    onOpenSearch={() => (searchOpen = true)}
    onReloadAll={() => void api.invoke("threads:reloadAll")}
  />
{/snippet}

<div class="sidebar-device relative flex h-full" class:sidebar-device--no-anim={resizingSidebar} class:sidebar-device--animating={animatingContent}>
  {#if snapshot.current}
    <!-- The sidebar lives in a hover host pinned to the window's left edge.
         When expanded the host is the full sidebar width and the rail sits
         flush on the chassis. When collapsed the host shrinks to a thin
         trigger strip and the rail morphs into a floating card slid off-screen;
         hovering grows the host to cover the card so it stays revealed. ⌘S
         toggles between the two states and the rail/content animate across. -->
    <div
      class="sidebar-host"
      class:sidebar-host--collapsed={sidebarCollapsed}
      class:sidebar-host--revealed={sidebarRevealed}
      style="--float-width: {sidebarWidth}px"
      role="presentation"
      onpointerenter={sidebarCollapsed ? () => (sidebarRevealed = true) : undefined}
      onpointerleave={sidebarCollapsed ? () => (sidebarRevealed = false) : undefined}
    >
      <div
        class="sidebar-rail"
        class:sidebar-rail--floating={sidebarCollapsed}
        class:sidebar-rail--shown={!sidebarCollapsed || sidebarRevealed}
        style="width: {sidebarWidth}px"
      >
        {@render sidebarBody()}
      </div>
    </div>
    {#if !sidebarCollapsed}
      <!-- Drag handle straddling the sidebar/content seam (no layout footprint). -->
      <div
        class="group absolute inset-y-0 z-[50] w-1.5 cursor-col-resize"
        style="left: {sidebarWidth - 3}px"
        onpointerdown={startSidebarResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      >
        <div
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent"
        ></div>
      </div>
    {/if}
    <div bind:this={contentEl} class="sidebar-content relative z-10 mb-2 mr-2 mt-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-surface shadow-[-4px_7px_18px_-6px_rgba(0,0,0,0.14),-4px_6px_10px_-4px_rgba(0,0,0,0.18)]" style="margin-left: {contentLeft}px">
    {#key view === "thread" ? `thread:${selectedThreadId}` : view === "testing" ? `testing:${testingProjectId}` : view === "work-queue" ? `work-queue:${workQueueProjectId}` : view}
    <div class="view-enter flex min-h-0 flex-1">
    {#if view === "settings"}
      <SettingsView initialQuery={settingsQuery} onOpenPlayroom={() => openView("playroom")} />
    {:else if view === "skills"}
      <SkillsView
        projects={snapshot.current.projects}
        projectId={selectedThread?.projectId ?? null}
      />
    {:else if view === "extensions"}
      <ExtensionsView
        projects={snapshot.current.projects}
        projectId={selectedThread?.projectId ?? null}
      />
    {:else if view === "automations"}
      <AutomationsView
        projects={snapshot.current.projects}
        automations={snapshot.current.automations}
        onSelectThread={selectThread}
      />
    {:else if view === "connections"}
      <ConnectorsView />
    {:else if view === "bws"}
      <BwsView />
    {:else if view === "remote"}
      <RemoteView />
    {:else if view === "playroom"}
      <PlayroomView />
    {:else if view === "graph"}
      <GraphView projectId={selectedThread?.projectId ?? null} />
    {:else if view === "work-queue"}
      <WorkQueueView
        projects={snapshot.current.projects}
        projectId={workQueueProjectId}
        onLaunched={selectThread}
      />
    {:else if view === "testing"}
      <TestingView
        projects={snapshot.current.projects}
        threads={snapshot.current.threads}
        projectId={testingProjectId}
        onSelectThread={selectThread}
      />
    {:else if selectedThread}
      <ThreadView
        thread={selectedThread}
        onSetEnvironment={setThreadEnvironment}
        onSelectThread={selectThread}
        onNewThread={newThreadForCurrentProject}
        pendingFind={pendingFindQuery}
        onFindConsumed={() => (pendingFindQuery = null)}
      />
    {:else}
      <main class="flex flex-1 items-center justify-center" data-testid="boot-ok">
        <div class="titlebar-drag absolute inset-x-0 top-0 h-12"></div>
        <p class="text-sm text-fainter">
          {snapshot.current.projects.length} projects · {snapshot.current.threads.length} threads —
          select or create a thread
        </p>
      </main>
    {/if}
    </div>
    {/key}
    {#if terminal.visible && selectedThread}
      <TerminalPane threadId={selectedThread.id} onClose={() => terminal.hide()} />
    {/if}
    </div>
    <RecordingBar />
    <SidePanel />
    {#if searchOpen}
      <SearchOverlay
        onSelect={selectThread}
        onClose={() => (searchOpen = false)}
        onNewThread={newThreadForCurrentProject}
        onNewChat={() => startNewThread(null)}
        onOpenView={openView}
        onOpenSettings={openSettings}
      />
    {/if}
  {:else}
    <main class="flex flex-1 items-center justify-center">
      <p class="text-sm text-fainter">Loading…</p>
    </main>
  {/if}

  {#if extensionUi.dialogs[0]}
    <ExtensionDialog request={extensionUi.dialogs[0]} />
  {/if}
  {#if extensionUi.terminalCustom && extensionUi.terminalCustom.threadId === selectedThreadId}
    <TerminalCustomOverlay frame={extensionUi.terminalCustom} threadId={extensionUi.terminalCustom.threadId} />
  {/if}
  <ImageLightbox />
  <TextAttachmentViewer />
  <SkillDialog />
  <Toasts />
  <PiHealthBanner />
</div>

{#if agentationProps}
  <Agentation {...agentationProps} />
{/if}
