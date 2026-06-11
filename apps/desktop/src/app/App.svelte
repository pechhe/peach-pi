<script lang="ts">
  import { onMount } from "svelte";
  import type { AppView } from "@peach-pi/shared-types";
  import { snapshot } from "../stores/snapshot.svelte";
  import { transcripts } from "../stores/transcripts.svelte";
  import { queues } from "../stores/composer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { preloadSounds } from "../lib/sound/button-click-sound";
  import { playDoneSound } from "../lib/sound/done-sound";
  import Sidebar from "./Sidebar.svelte";
  import ThreadView from "./ThreadView.svelte";
  import TestingView from "./TestingView.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import SettingsView from "./SettingsView.svelte";
  import SkillsView from "./SkillsView.svelte";
  import ExtensionsView from "./ExtensionsView.svelte";
  import ExtensionDialog from "./ExtensionDialog.svelte";
  import Toasts from "./Toasts.svelte";

  let selectedThreadId = $state<string | null>(null);
  let view = $state<AppView>("thread");
  let searchOpen = $state(false);

  const selectedThread = $derived(
    snapshot.current?.threads.find((t) => t.id === selectedThreadId) ?? null,
  );

  // Done sound: any thread transitioning running → idle chimes once.
  let lastStatuses = new Map<string, string>();
  $effect(() => {
    const threads = snapshot.current?.threads ?? [];
    for (const t of threads) {
      const prev = lastStatuses.get(t.id);
      if (prev === "running" && t.status === "idle") playDoneSound();
      lastStatuses.set(t.id, t.status);
    }
  });

  function selectThread(id: string) {
    selectedThreadId = id;
    view = "thread";
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      searchOpen = !searchOpen;
      return;
    }
    // Shift+digit shortcuts only outside inputs.
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
    if (e.shiftKey && e.key === "^") {
      view = "testing";
    }
  }

  onMount(() => {
    transcripts.init();
    queues.init();
    sessionMetas.init();
    extensionUi.init();
    void snapshot.init();
    preloadSounds();
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="flex h-full">
  {#if snapshot.current}
    <Sidebar
      projects={snapshot.current.projects}
      threads={snapshot.current.threads}
      {selectedThreadId}
      activeView={view}
      onSelect={selectThread}
      onOpenView={(v) => (view = v)}
      onOpenSearch={() => (searchOpen = true)}
    />
    {#if view === "settings"}
      <SettingsView />
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
    {:else if view === "testing"}
      <TestingView
        projects={snapshot.current.projects}
        threads={snapshot.current.threads}
        onSelect={selectThread}
      />
    {:else if selectedThread}
      <ThreadView thread={selectedThread} />
    {:else}
      <main class="flex flex-1 items-center justify-center" data-testid="boot-ok">
        <div class="titlebar-drag absolute inset-x-0 top-0 h-12"></div>
        <p class="text-sm text-zinc-600">
          {snapshot.current.projects.length} projects · {snapshot.current.threads.length} threads —
          select or create a thread
        </p>
      </main>
    {/if}
    {#if searchOpen}
      <SearchOverlay
        projects={snapshot.current.projects}
        threads={snapshot.current.threads}
        onSelect={selectThread}
        onClose={() => (searchOpen = false)}
      />
    {/if}
  {:else}
    <main class="flex flex-1 items-center justify-center">
      <p class="text-sm text-zinc-600">Loading…</p>
    </main>
  {/if}

  {#if extensionUi.dialogs[0]}
    <ExtensionDialog request={extensionUi.dialogs[0]} />
  {/if}
  <Toasts />
</div>
