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
  import { sideChat } from "../stores/side-chat.svelte";
  import { preloadSounds } from "../lib/sound/button-click-sound";
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
  import AgentsView from "./AgentsView.svelte";
  import GraphView from "./GraphView.svelte";
  import RecordingBar from "./RecordingBar.svelte";
  import ConnectorsView from "./ConnectorsView.svelte";
  import BwsView from "./BwsView.svelte";
  import TestingView from "./TestingView.svelte";
  import ExtensionDialog from "./ExtensionDialog.svelte";
  import TerminalCustomOverlay from "./TerminalCustomOverlay.svelte";
  import ImageLightbox from "./ImageLightbox.svelte";
  import TextAttachmentViewer from "./TextAttachmentViewer.svelte";
  import SkillDialog from "./SkillDialog.svelte";
  import Toasts from "./Toasts.svelte";
  import SidePanel from "./SidePanel.svelte";
  import PiHealthBanner from "./PiHealthBanner.svelte";
  import { Agentation } from "sv-agentation";
  const agentationProps = import.meta.env.DEV
    ? { workspaceRoot: null, includeComponentContext: true, includeComputedStyles: false }
    : null;

  let selectedThreadId = $state<string | null>(null);
  let view = $state<AppView>("thread");
  // Per-project scope for views that are scoped to one project (Testing).
  let testingProjectId = $state<string | null>(null);

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
  let resizing = $state(false);
  let widthSeeded = false;
  $effect(() => {
    if (widthSeeded) return;
    const w = snapshot.current?.ui.sidebarWidth;
    if (typeof w === "number") {
      sidebarWidth = w;
      widthSeeded = true;
    }
  });
  // Expose the content area's left edge so overlays (including portaled
  // dialogs) can centre over the page content rather than the whole window.
  $effect(() => {
    document.documentElement.style.setProperty("--content-left", `${sidebarWidth}px`);
  });
  function startSidebarResize(e: PointerEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const move = (ev: PointerEvent) => {
      sidebarWidth = Math.min(560, Math.max(200, startW + (ev.clientX - startX)));
    };
    const up = () => {
      resizing = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
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

  // ── Navigation history (⌘[ back · ⌘] forward) ───────────────────────
  type NavEntry = { view: AppView; threadId: string | null; projectId?: string | null };
  let navHistory = $state<NavEntry[]>([]);
  let navIndex = $state(-1);

  function applyNav(entry: NavEntry) {
    view = entry.view;
    selectedThreadId = entry.threadId;
    if (entry.view === "testing") testingProjectId = entry.projectId ?? null;
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
  }

  onMount(() => {
    transcripts.init();
    queues.init();
    sessionMetas.init();
    extensionUi.init();
    sideChat.init();
    void snapshot.init();
    preloadSounds();
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="relative flex h-full bg-sidebar">
  {#if snapshot.current}
    <Sidebar
      width={sidebarWidth}
      projects={snapshot.current.projects}
      worktrees={snapshot.current.worktrees}
      threads={snapshot.current.threads}
      collapsedProjects={snapshot.current.ui.collapsedProjects}
      {selectedThreadId}
      activeView={view}
      onSelect={selectThread}
      onNewChat={() => startNewThread(null)}
      onOpenView={openView}
      onOpenTesting={openTesting}
      onNewThread={newThreadInProject}
      onNewWorktree={newWorktreeInProject}
      onOpenSearch={() => (searchOpen = true)}
    />
    <!-- Drag handle straddling the sidebar/content seam (no layout footprint). -->
    <div
      class="group absolute inset-y-0 z-20 w-1.5 cursor-col-resize"
      style="left: {sidebarWidth - 3}px"
      onpointerdown={startSidebarResize}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    >
      <div
        class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors {resizing
          ? 'bg-border-focus'
          : 'bg-transparent group-hover:bg-border-strong'}"
      ></div>
    </div>
    <div class="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-l-[22px] bg-surface shadow-[-4px_0_16px_-5px_rgba(0,0,0,0.22)]">
    {#key view === "thread" ? `thread:${selectedThreadId}` : view === "testing" ? `testing:${testingProjectId}` : view}
    <div class="view-enter flex min-h-0 flex-1">
    {#if view === "settings"}
      <SettingsView initialQuery={settingsQuery} />
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
    {:else if view === "agents"}
      <AgentsView projects={snapshot.current.projects} />
    {:else if view === "graph"}
      <GraphView projectId={selectedThread?.projectId ?? null} />
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
        onOpenGraph={() => openView("graph")}
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
        projects={snapshot.current.projects}
        threads={snapshot.current.threads}
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
  <Toasts {sidebarWidth} />
  <PiHealthBanner />
</div>

{#if agentationProps}
  <Agentation {...agentationProps} />
{/if}
