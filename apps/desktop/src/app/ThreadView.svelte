<script lang="ts">
  import { isNewThread, type Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { transcripts } from "../stores/transcripts.svelte";
  import { terminal } from "../stores/terminal.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { collectAgents } from "../lib/subagent/journey.svelte";
  import { FLEET_WIDGET_KEY, parseFleet, type FleetAgent } from "../lib/subagent/fleet";
  import { mapTurns } from "../lib/transcript/turns";
  import type { CompactionItem } from "./CompactionDialog.svelte";
  import CompactionDialog from "./CompactionDialog.svelte";
  import RewindDialog from "./RewindDialog.svelte";
  import ForkPickerDialog from "./ForkPickerDialog.svelte";
  import ThreadHeader from "../features/threads/ThreadHeader.svelte";
  import Transcript from "../features/threads/Transcript.svelte";
  import ComposerDock from "../features/threads/ComposerDock.svelte";
  import { groupPrepRuns } from "../features/threads/lib/group-prep-runs";
  import { ThreadFind } from "../features/threads/lib/thread-find.svelte";
  import { RewindState } from "../features/threads/lib/rewind.svelte";

  let { thread, onSetEnvironment, onSelectThread, onNewThread, onCloneThread, onForkThread, pendingFind, onFindConsumed }: {
    thread: Thread;
    /** Flip a brand-new (unsent) thread between its project dir and a worktree. */
    onSetEnvironment?: (threadId: string, worktree: boolean) => void | Promise<void>;
    /** Navigate to a thread (used by the DevTap install action). */
    onSelectThread?: (threadId: string) => void;
    /** Start a new thread in the current project (`/new` system command). */
    onNewThread?: () => void;
    /** Clone the current thread's whole active branch into a new thread
     *  (pi `/clone`). */
    onCloneThread?: () => void | Promise<void>;
    /** Fork the current thread up to (excluding) a user-message entry (pi
     *  `/fork`). Pre-fills the new thread's composer with the prompt. */
    onForkThread?: (entryId: string) => void | Promise<void>;
    /** Set when the search overlay passes a body-match query through. ThreadView
     *  opens its FindBar pre-filled and calls `onFindConsumed` once applied. */
    pendingFind?: string | null;
    onFindConsumed?: () => void;
  } = $props();

  // Logo lookup for @-connection badges. The hint text only carries names, so
  // we map name → logoUrl from the live connection lists (favicon, monogram
  // fallback handled by ConnectorIcon). Refreshed when connections change.
  let connLogos = $state<Map<string, string | null>>(new Map());
  async function loadConnLogos() {
    try {
      const conns = await api.invoke("executor:connections");
      const m = new Map<string, string | null>();
      for (const c of conns) m.set(c.identityLabel ?? c.name, null);
      connLogos = m;
    } catch {
      // Best-effort: badges fall back to a monogram without a logo.
    }
  }
  $effect(() => {
    void loadConnLogos();
    const off = api.on("event:executorChanged", () => void loadConnLogos());
    return off;
  });

  const items = $derived(transcripts.itemsFor(thread.id));

  // Running session totals: sum every assistant turn's tokens + cost. Cost is
  // only summed for turns whose model had known pricing (costUsd present).
  const sessionUsage = $derived.by(() => {
    let input = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let output = 0;
    let cost = 0;
    let hasCost = false;
    for (const it of items) {
      if (it.kind === "assistant" && it.usage) {
        input += it.usage.input;
        cacheRead += it.usage.cacheRead;
        cacheWrite += it.usage.cacheWrite;
        output += it.usage.output;
        if (it.usage.costUsd != null) {
          cost += it.usage.costUsd;
          hasCost = true;
        }
      }
    }
    return { input: input + cacheRead + cacheWrite, cacheRead, output, cost, hasCost };
  });
  // The composer centres (and the transcript hides) until the first message.
  const isEmpty = $derived(
    transcripts.hasLoaded(thread.id) && items.length === 0 && isNewThread(thread.title),
  );

  // Subagent cards: group every subagent launch in the transcript into one
  // persistent entity per agent name; the introducing call renders it.
  const agentTimeline = $derived(collectAgents(items));
  // Live progress, parsed from the pi-subagents "subagent-status" widget feed.
  const fleet = $derived.by(() => {
    const w = extensionUi.widgetsFor(thread.id).find((x) => x.key === FLEET_WIDGET_KEY);
    const parsed = w ? parseFleet(w.lines) : null;
    const map = new Map<string, FleetAgent>();
    for (const a of parsed?.agents ?? []) map.set(a.name, a);
    return map;
  });

  // Fold runs of prep (successful tool calls + thinking-only assistant items)
  // into one expandable "Reasoning" card, Codex-style.
  const rows = $derived(groupPrepRuns(items));

  // In-thread find (⌘F) and rewind/fork state — shared across the shell,
  // Transcript (find DOM effects + render hits) and the rewind dialogs.
  const find = new ThreadFind(() => items);
  const rewind = new RewindState(() => thread, () => items, (entryId) => onForkThread?.(entryId));
  // shell exposes the same turn-map to AssistantMessage via Transcript.
  const turnMap = $derived(mapTurns(items, rewind.turns));

  // Compaction summary dialog state — animated (motion-sv) dialog instead of
  // expanding the compaction card inline in the chat surface.
  let compactionDialogItem = $state<CompactionItem | null>(null);

  // Refetch the turn list (entry ids) when the transcript changes. Safe to
  // run during a live turn: listTurns only returns user-message entries.
  $effect(() => {
    void items.length;
    const id = thread.id;
    void api.invoke("threads:listTurns", id).then((t) => {
      if (thread.id === id) rewind.turns = t;
    }).catch(() => {});
  });

  // Clear the greyed preview once it no longer matches the live transcript
  // (a new message extended the thread, or we switched threads).
  $effect(() => {
    void items.length;
    rewind.syncPreview();
  });

  // When a search-overlay body-match is clicked, open the FindBar with the
  // original search term so the user lands directly on the relevant text.
  $effect(() => {
    const pf = pendingFind;
    if (pf) {
      find.applyPending(pf);
      onFindConsumed?.();
    }
  });

  // Route bare paste (e.g. via Edit menu / context menu with no ⌘V keydown)
  // into the composer when focus isn't already in an editable.
  $effect(() => {
    function onWindowPaste(e: ClipboardEvent) {
      if (isFocusInEditable()) return;
      const input = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="composer-input"]',
      );
      if (input) input.focus();
      // Don't preventDefault: native paste delivers to the textarea.
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  });

  function onKeydown(e: KeyboardEvent) {
    // ⌃` toggles the integrated terminal (VS Code muscle memory).
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      terminal.toggle();
      return;
    }
    // Escape closes the find bar even when the input isn't focused.
    if (e.key === "Escape" && find.findOpen) {
      e.preventDefault();
      find.close();
      return;
    }
    // ⌘F opens a thread-scoped find bar (not the global ⌘K palette).
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      find.toggleOpenOrFocus();
      return;
    }
    // Auto-route typing to the composer.
    focusComposerForEditableKeydown(e);
  }

  // True when the current focus is already inside something the user can type
  // into — in which case we must not steal the keystroke.
  function isFocusInEditable(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    const tag = active.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return true;
    if (active.isContentEditable) return true;
    return false;
  }

  function focusComposerForEditableKeydown(e: KeyboardEvent) {
    if (isFocusInEditable()) return;
    const input = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="composer-input"]',
    );
    if (!input) return;
    // Plain Enter with no modifiers: if the composer already has a draft,
    // behave as if Enter were pressed in the composer.
    if (
      e.key === "Enter" &&
      !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
      input.value.trim().length > 0
    ) {
      e.preventDefault();
      input.focus();
      const opts: KeyboardEventInit = { key: "Enter", code: "Enter", bubbles: true, composed: true };
      input.dispatchEvent(new KeyboardEvent("keydown", opts));
      input.dispatchEvent(new KeyboardEvent("keyup", opts));
      return;
    }
    // Paste (⌘V / ⌃V): focus so the browser's paste default lands here.
    const isPaste = (e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V");
    // Plain printable char: no ⌘/⌃/⌥, single-char key. Shift is allowed.
    const isPrintable = !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1;
    if (!isPaste && !isPrintable) return;
    input.focus();
  }
</script>

<div class="flex h-full flex-1 flex-col">
  <ThreadHeader
    {thread}
    {isEmpty}
    {sessionUsage}
    turns={rewind.turns}
    onOpenForkPicker={() => rewind.openForkPicker()}
    {onSelectThread}
  />

  {#if !isEmpty}
    <Transcript
      {thread}
      {items}
      {rows}
      {agentTimeline}
      {fleet}
      {connLogos}
      {turnMap}
      {find}
      rewound={rewind.rewound}
      onRewind={(entryId) => rewind.openRewindDialog(entryId)}
      onFork={(entryId) => rewind.pickFork(entryId)}
      onOpenCompaction={(item) => (compactionDialogItem = item)}
    />
    {#each extensionUi.widgetsFor(thread.id).filter((w) => w.key !== FLEET_WIDGET_KEY) as widget (widget.key)}
      <div class="mx-6 mb-1 shrink-0 rounded-lg border border-border bg-surface/60 px-3 py-2" data-testid="extension-widget">
        <pre class="overflow-x-auto font-mono text-[10px] leading-relaxed text-muted">{widget.lines.join("\n")}</pre>
      </div>
    {/each}
  {/if}

  <ComposerDock
    {thread}
    {isEmpty}
    onRewind={(n) => rewind.rewindFromEnd(n)}
    {onNewThread}
    onCloneThread={() => onCloneThread?.()}
    onForkPicker={() => rewind.openForkPicker()}
    {onSetEnvironment}
  />

  <RewindDialog
    bind:open={rewind.rewindDialogOpen}
    bind:revertFiles={rewind.revertFiles}
    canRevert={rewind.canRevert}
    turnCount={rewind.pendingRewind?.turnCount ?? 1}
    promptPreview={rewind.pendingRewind?.promptPreview ?? ""}
    onConfirm={() => rewind.confirmRewind()}
  />
  <ForkPickerDialog
    bind:open={rewind.forkPickerOpen}
    turns={rewind.turns}
    onPick={(entryId) => rewind.pickFork(entryId)}
  />
  <CompactionDialog
    bind:item={compactionDialogItem}
    onRetry={() => api.invoke("threads:retryCompact", thread.id).catch(console.error)}
  />
</div>

<svelte:window onkeydown={onKeydown} />

<style>
  /* Find-bar hit outlines are applied across the per-kind child components
     (ToolRow/UserMessage/…), so the rule must be global. */
  :global(.thread-find-hit) {
    outline: 2px solid oklch(0.6 0.16 52 / 0.7);
    outline-offset: 3px;
    border-radius: 0.5rem;
  }
</style>
