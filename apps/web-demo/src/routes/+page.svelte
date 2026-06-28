<script lang="ts">
  import { onMount } from "svelte";
  import { snapshot } from "../desktop-renderer/stores/snapshot.svelte";
  import { transcripts } from "../desktop-renderer/stores/transcripts.svelte";
  import { drafts } from "../desktop-renderer/stores/composer.svelte";
  import { api } from "../desktop-renderer/lib/ipc";
  import Sidebar from "../desktop-renderer/app/Sidebar.svelte";
  import ThreadView from "../desktop-renderer/app/ThreadView.svelte";
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

  function tryPrompt(): void {
    if (!selectedThreadId) return;
    triggerDemoPrompt(selectedThreadId, "Can you add input validation to the login form?");
  }

  function selectThread(id: string): void {
    void api.invoke("app:setSelectedThread" as never, id);
    // Optimistic: flip the UI's selectedThreadId locally too so the click
    // feels snappy (the mock doesn't emit a new snapshot for this channel).
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
  <!-- Laptop-cased app viewport -->
  <div class="laptop">
    <div class="laptop__lid">
      <div class="laptop__notch"><span></span></div>
      <div class="laptop__bar">
        <span class="light light--close"></span>
        <span class="light light--min"></span>
        <span class="light light--max"></span>
        <span class="laptop__bar-title">peach-pi — demo</span>
      </div>

      <div class="laptop__screen">
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
              activeView="thread"
              onSelect={selectThread}
              onNewChat={() => {}}
              onOpenView={() => {}}
              onOpenTesting={() => {}}
              onOpenWorkQueue={() => {}}
              onNewThread={() => {}}
              onNewWorktree={() => {}}
              onOpenSearch={() => {}}
              onReloadAll={() => void api.invoke("threads:reloadAll" as never)}
              onGoBack={() => {}}
              onGoForward={() => {}}
              canGoBack={false}
              canGoForward={false}
              remoteFirst={false}
            />
            <div class="app-shell__content">
              {#if selectedThread}
                <ThreadView thread={selectedThread} onSelectThread={selectThread} onSetEnvironment={() => {}} onNewThread={() => {}} onCloneThread={() => {}} onForkThread={() => {}} />
              {:else}
                <div class="empty-state">Select a thread to start.</div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="booting">Booting Peach Pi…</div>
        {/if}
      </div>
    </div>
    <div class="laptop__base"></div>
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
    padding: 2.5rem 1rem 2rem;
    gap: 1.25rem;
    background:
      radial-gradient(circle at 30% 0%, #1c1c20, transparent 50%),
      var(--color-bg, #101012);
  }

  .laptop {
    width: 100%;
    max-width: 1180px;
  }
  .laptop__lid {
    border-radius: 12px;
    border: 1px solid #2a2a2e;
    background: #0c0c0e;
    overflow: hidden;
    box-shadow:
      0 30px 60px rgba(0, 0, 0, 0.55),
      0 8px 20px rgba(0, 0, 0, 0.5);
  }
  .laptop__notch {
    height: 6px;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding-bottom: 2px;
    background: #0c0c0e;
  }
  .laptop__notch span {
    width: 48px;
    height: 2px;
    border-radius: 999px;
    background: #1a1a1d;
  }
  .laptop__bar {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--color-border, #27272a);
    background: var(--color-sidebar, #161618);
  }
  .light { width: 12px; height: 12px; border-radius: 50%; }
  .light--close { background: #ff5f57; }
  .light--min { background: #febc2e; }
  .light--max { background: #28c840; }
  .laptop__bar-title {
    margin-left: 12px;
    font-family: var(--font-mono, ui-monospace);
    font-size: 11px;
    color: var(--color-faint, #71717a);
  }

  .laptop__screen {
    height: 640px;
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
    border-radius: 16px;
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

  .laptop__base {
    margin: 0 -1%;
    width: 102%;
    height: 12px;
    border-radius: 0 0 12px 12px;
    background: #161618;
    border: 1px solid #2a2a2e;
    border-top: none;
  }

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
