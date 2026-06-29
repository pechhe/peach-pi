<script lang="ts">
  import { onMount } from "svelte";
  import type { AppView } from "@peach-pi/shared-types";
  import { snapshot } from "../desktop-renderer/stores/snapshot.svelte";
  import { transcripts } from "../desktop-renderer/stores/transcripts.svelte";
  import { drafts } from "../desktop-renderer/stores/composer.svelte";
  import { api } from "../desktop-renderer/lib/ipc";
  import Sidebar from "../desktop-renderer/app/Sidebar.svelte";
  import ThreadView from "../desktop-renderer/app/ThreadView.svelte";
  import AutomationsView from "../desktop-renderer/app/AutomationsView.svelte";
  import SkillsView from "../desktop-renderer/app/SkillsView.svelte";
  import ExtensionsView from "../desktop-renderer/app/ExtensionsView.svelte";
  import SettingsView from "../desktop-renderer/app/SettingsView.svelte";
  import ConnectorsView from "../desktop-renderer/app/ConnectorsView.svelte";
  import BwsView from "../desktop-renderer/app/BwsView.svelte";
  import RemoteView from "../desktop-renderer/app/RemoteView.svelte";
  import PlayroomView from "../desktop-renderer/app/PlayroomView.svelte";
  import TestingView from "../desktop-renderer/app/TestingView.svelte";
  import WorkQueueView from "../desktop-renderer/app/WorkQueueView.svelte";
  import { triggerDemoPrompt } from "../lib/mock-peach-pi";
  import ArrowDownToDot from "@lucide/svelte/icons/arrow-down-to-dot";

  onMount(async () => {
    await snapshot.init();
    transcripts.init();
    // The Composer reads its draft from `drafts`; nothing else to seed.
  });

  let booted = $derived(snapshot.current !== null);

  // Default to the active demo thread + the canned prompt for the "Try" CTA.
  let selectedThreadId = $derived(snapshot.current?.ui.selectedThreadId ?? null);
  let selectedThread = $derived(
    snapshot.current?.threads.find((t) => t.id === selectedThreadId) ?? null,
  );
  let canPrompt = $derived(
    !!selectedThreadId &&
      selectedThread?.status === "idle" &&
      transcripts.itemsFor(selectedThreadId).length === 0,
  );

  // Active view: thread (default), or one of the sidebar destinations.
  // Lifted out of App.svelte's view dispatcher so all sidebar pages render.
  let view = $state<AppView>("thread");
  function openView(v: AppView): void {
    view = v;
  }

  function tryPrompt(): void {
    if (!selectedThreadId) return;
    triggerDemoPrompt(selectedThreadId, "Can you add input validation to the login form?");
  }

  function selectThread(id: string): void {
    void api.invoke("app:setSelectedThread" as never, id);
    // Switch back to the thread view + flip selectedThreadId locally so the
    // click feels snappy (the mock doesn't emit a new snapshot for this).
    view = "thread";
    if (snapshot.current) {
      snapshot.current = {
        ...snapshot.current,
        ui: { ...snapshot.current.ui, selectedThreadId: id },
      };
    }
  }
</script>

<svelte:head>
  <title>Peach Pi — live demo</title>
  <meta
    name="description"
    content="The Peach Pi agent UI running in your browser. A canned replay shows how assistant streaming, tool calls, and reasoning feel."
  />
</svelte:head>

<div class="demo-shell">
  <!-- Modern macOS-style app window (no skeuomorphic laptop). -->
  <div class="window">
    <div class="window__bar">
      <span class="traffic traffic--close"></span>
      <span class="traffic traffic--min"></span>
      <span class="traffic traffic--max"></span>
      <span class="window__title">peach-pi</span>
    </div>

    <div class="window__screen">
      {#if booted && snapshot.current}
        <div class="app-shell sidebar-device">
          <Sidebar
            width={snapshot.current.ui.sidebarWidth}
            projects={snapshot.current.projects}
            worktrees={snapshot.current.worktrees}
            threads={snapshot.current.threads}
            automationCount={snapshot.current.automations.length}
            collapsedProjects={snapshot.current.ui.collapsedProjects}
            {selectedThreadId}
            activeView={view}
            onSelect={selectThread}
            onNewChat={() => {}}
            onOpenView={openView}
            onOpenTesting={() => openView("testing")}
            onOpenWorkQueue={() => openView("work-queue")}
            onNewThread={() => {}}
            onNewWorktree={() => {}}
            onOpenSearch={() => {}}
            onGoBack={() => {}}
            onGoForward={() => {}}
            canGoBack={false}
            canGoForward={false}
            remoteFirst={false}
          />
          <div class="app-shell__content">
            <svelte:boundary>
              {#snippet failed(error)}
                <div class="view-error">
                  <strong>This panel isn't interactive in the demo.</strong>
                  <span>{error instanceof Error ? error.message : String(error)}</span>
                </div>
              {/snippet}
              {#if view === "settings"}
                <SettingsView initialQuery="" onOpenPlayroom={() => openView("playroom")} />
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
              {:else if view === "testing"}
                <TestingView
                  projects={snapshot.current.projects}
                  threads={snapshot.current.threads}
                  projectId={selectedThread?.projectId ?? null}
                  onSelectThread={selectThread}
                />
              {:else if view === "work-queue"}
                <WorkQueueView
                  projects={snapshot.current.projects}
                  projectId={selectedThread?.projectId ?? null}
                />
              {:else if selectedThread}
                <ThreadView thread={selectedThread} onSelectThread={selectThread} onSetEnvironment={() => {}} onNewThread={() => {}} onCloneThread={() => {}} onForkThread={() => {}} />
              {:else}
                <div class="empty-state">Select a thread to start.</div>
              {/if}
            </svelte:boundary>
          </div>
        </div>
      {:else}
        <div class="booting">Booting Peach Pi…</div>
      {/if}
    </div>
  </div>

  {#if canPrompt}
    <button class="try-cta" type="button" onclick={tryPrompt}>
      <ArrowDownToDot size={14} />
      <span class="try-cta__label">Try the canned prompt:</span>
      <span class="try-cta__prompt">"Can you add input validation to the login form?"</span>
      <span class="try-cta__arrow">→</span>
    </button>
  {/if}

  <div class="demo-footer">
    <a class="demo-link" href="https://peachpi.vercel.app/" target="_blank" rel="noopener">
      ↧ Download for macOS
    </a>
    <a class="demo-link" href="https://github.com/earendil-works/pi-coding-agent" target="_blank" rel="noopener">
      ⟨/⟩ pi agent on GitHub
    </a>
  </div>
  <p class="demo-disclaimer">
    Canned replay only — no model is invoked. Assistant tokens, tool calls, and reasoning shown here were scripted for demo purposes.
  </p>
</div>

<style>
  .demo-shell {
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1.5rem 2rem;
    gap: 1.25rem;
    background:
      radial-gradient(ellipse at 35% 10%, #1f1f24 0%, transparent 55%),
      radial-gradient(ellipse at 80% 90%, #16161a 0%, transparent 50%),
      #0a0a0c;
  }

  /* ─── Modern macOS-style app window ─────────────────────────────── */
  .window {
    width: 100%;
    max-width: 1180px;
    border-radius: 14px;
    overflow: hidden;
    background: var(--color-bg, #101012);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.04) inset,
      0 30px 80px -20px rgba(0, 0, 0, 0.7),
      0 12px 30px -10px rgba(0, 0, 0, 0.5);
  }
  .window__bar {
    height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-bottom: 1px solid var(--color-border, #27272a);
    background: linear-gradient(180deg, #1c1c20 0%, #161618 100%);
    user-select: none;
  }
  .traffic {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.25);
  }
  .traffic--close { background: #ff5f57; }
  .traffic--min { background: #febc2e; }
  .traffic--max { background: #28c840; }
  .window__title {
    margin-left: 10px;
    font-family: var(--font-mono, ui-monospace);
    font-size: 12px;
    color: var(--color-faint, #71717a);
    letter-spacing: 0.02em;
  }
  .window__screen {
    height: 680px;
    background: var(--color-bg, #101012);
  }

  .app-shell {
    display: flex;
    height: 100%;
    width: 100%;
  }
  .app-shell__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    margin: 8px 8px 8px 0;
    border-radius: 10px;
    overflow: hidden;
    background: var(--color-surface, #18181b);
    box-shadow:
      -4px 7px 18px -6px rgba(0, 0, 0, 0.14),
      -4px 6px 10px -4px rgba(0, 0, 0, 0.18);
  }

  .booting, .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-faint, #71717a);
    font-size: 14px;
  }

  .view-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--color-faint, #71717a);
    font-size: 14px;
  }
  .view-error strong { color: var(--color-fg-soft, #d4d4d8); }

  .try-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong, #3f3f46);
    background: var(--color-surface, #18181b);
    color: var(--color-fg-soft, #d4d4d8);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .try-cta:hover { background: var(--color-surface-2, #27272a); }
  .try-cta__label { color: var(--color-muted, #a1a1aa); }
  .try-cta__prompt { font-weight: 500; }
  .try-cta__arrow { color: var(--color-accent, #38bdf8); transition: transform 0.15s ease; }
  .try-cta:hover .try-cta__arrow { transform: translateX(2px); }

  .demo-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 4px;
  }
  .demo-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-border-strong, #3f3f46);
    background: var(--color-surface, #18181b);
    color: var(--color-fg-soft, #d4d4d8);
    text-decoration: none;
    font-size: 14px;
    transition: background 0.15s ease;
  }
  .demo-link:hover { background: var(--color-surface-2, #27272a); }

  .demo-disclaimer {
    color: var(--color-fainter, #52525b);
    font-size: 12px;
    max-width: 480px;
    text-align: center;
    line-height: 1.5;
  }
</style>
