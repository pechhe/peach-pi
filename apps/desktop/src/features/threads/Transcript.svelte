<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Thread, TranscriptItem } from "@peach-pi/shared-types";
  import { transcripts } from "../../stores/transcripts.svelte";
  import { sendAnim } from "../../stores/send-anim.svelte";
  import { queues } from "../../stores/composer.svelte";
  import { type FleetAgent } from "../../lib/subagent/fleet";
  import { collectAgents } from "../../lib/subagent/journey.svelte";
  import type { TurnMap } from "../../lib/transcript/turns";
  import { api } from "../../lib/ipc";
  import X from "@lucide/svelte/icons/x";
  import ArrowDownToDot from "@lucide/svelte/icons/arrow-down-to-dot";
  import FindBar from "../../app/FindBar.svelte";
  import WorkingLabel from "../../app/WorkingLabel.svelte";
  import TranscriptRow from "./TranscriptRow.svelte";
  import {
    itemText,
    type Row,
  } from "./lib/group-prep-runs";
  import { ScrollFollow } from "./lib/scroll-follow.svelte";
  import {
    ThreadFind,
    clearFindHighlights,
    addRanges,
    FIND_HL,
    FIND_HL_CUR,
  } from "./lib/thread-find.svelte";

  let {
    thread,
    items,
    rows,
    agentTimeline,
    fleet,
    connLogos,
    turnMap,
    find,
    rewound,
    onRewind,
    onFork,
    onOpenCompaction,
  }: {
    thread: Thread;
    items: readonly TranscriptItem[];
    rows: Row[];
    agentTimeline: ReturnType<typeof collectAgents>;
    fleet: Map<string, FleetAgent>;
    connLogos: Map<string, string | null>;
    turnMap: TurnMap;
    find: ThreadFind;
    rewound: {
      threadId: string;
      before: TranscriptItem[];
      beforeLen: number;
      settledLen: number | null;
    } | null;
    onRewind: (entryId: string) => void;
    onFork: (entryId: string) => void;
    onOpenCompaction: (item: Extract<TranscriptItem, { kind: "compaction" }>) => void;
  } = $props();

  const scroll = new ScrollFollow(() => thread.status === "running");
  let findBar = $state<FindBar | null>(null);

  // Reset to the first match whenever the query changes, UNLESS a pending-find
  // from ⌘K is in flight (it set findIndex itself).
  $effect(() => { find.onQueryChanged(); });

  // Clamp findIndex if matches change (e.g. items loaded after pendingFind set
  // the index based on an empty list). Keeps the orange highlight correct.
  $effect(() => {
    const len = find.matches.length;
    if (len > 0 && find.findIndex >= len) find.findIndex = len - 1;
  });

  // Scroll the active match into view, expanding collapsed <details> (thinking
  // / tool / compaction blocks) so the matched text is visible. Force-open
  // only — never force-closed — so manual toggles are preserved.
  $effect(() => {
    const id = find.currentMatchId;
    const el = scroll.scrollEl;
    if (!id || !el) return;
    const target = el.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.querySelectorAll("details").forEach((d) => (d.open = true));
    // Reveal collapsed ancestors too (e.g. a folded tool-call group).
    let p: Element | null = target.parentElement;
    while (p && p !== el) {
      if (p instanceof HTMLDetailsElement) p.open = true;
      p = p.parentElement;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  // Highlight the matched term itself via the CSS Custom Highlight API. This
  // paints over Range objects without mutating the DOM, so it survives the
  // {@html}/per-word-span rebuilds in Markdown/StreamingText. Two registers:
  // every hit in dim, the current block's hits brighter.
  $effect(() => {
    const q = find.findQuery.trim().toLowerCase();
    void find.currentMatchId;
    void items; // re-scan as streamed content / matches change
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const Hl = (globalThis as unknown as { Highlight?: new () => { add: (r: Range) => void } }).Highlight;
    if (!reg || !Hl || !find.findOpen || !q || !scroll.scrollEl) {
      clearFindHighlights();
      return;
    }
    // Wait a frame so the latest transcript DOM is in place.
    const raf = requestAnimationFrame(() => {
      const all = new Hl();
      const cur = new Hl();
      for (const id of find.matches) {
        const el = scroll.scrollEl!.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
        if (!el) continue;
        addRanges(el, q, id === find.currentMatchId ? cur : all);
      }
      reg.set(FIND_HL, all);
      reg.set(FIND_HL_CUR, cur);
    });
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(clearFindHighlights);

  $effect(() => { void transcripts.ensure(thread.id); });

  // Refocus the FindBar input when ⌘F is pressed while it's already open.
  $effect(() => {
    void find.focusTick;
    findBar?.focus();
  });

  // On open, jump to the very bottom; afterwards, only pin to bottom while
  // streaming if the user hasn't scrolled up to read history.
  $effect(() => {
    void items;
    const el = scroll.scrollEl;
    if (!el) return;
    if (!scroll.didInitialScroll) {
      // Wait for history to load before the initial jump.
      if (items.length === 0) return;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        scroll.didInitialScroll = true;
      });
      return;
    }
    scroll.rearmIfNearBottom();
    // glideToBottom re-checks scrolledUp every frame, so a mid-scroll token
    // can't yank the user back down.
    if (!scroll.scrolledUp) scroll.glideToBottom();
  });

  // The user just sent a message; even if they scrolled up to read history,
  // sending means "bring me to the bottom".
  $effect(() => {
    void sendAnim.sentTick(thread.id);
    scroll.scrollToBottom();
  });

  // Keep the bottom pinned whenever content height changes (streaming text,
  // tool output, the working indicator) or the scroll area itself resizes.
  $effect(() => {
    const el = scroll.scrollEl;
    if (!el || !scroll.didInitialScroll) return;
    const content = el.firstElementChild;
    const pin = () => { if (!scroll.scrolledUp) scroll.glideToBottom(); };
    const ro = new ResizeObserver(pin);
    ro.observe(el);
    if (content) ro.observe(content);
    return () => {
      ro.disconnect();
      scroll.dispose?.();
    };
  });
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
  {#if find.findOpen}
    <FindBar
      bind:this={findBar}
      bind:query={find.findQuery}
      current={find.matches.length ? find.findIndex + 1 : 0}
      total={find.matches.length}
      onNext={() => find.findNext()}
      onPrev={() => find.findPrev()}
      onClose={() => find.close()}
    />
  {/if}
  <div
    bind:this={scroll.scrollEl}
    class="transcript-scroll flex flex-1 flex-col overflow-y-auto px-6 pt-5 pb-26"
    data-testid="transcript"
    onscroll={scroll.onScroll}
    onwheel={scroll.onWheel}
  >
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3">
      {#if items.length === 0}
        <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p class="text-[15px] font-medium text-muted">What are we building?</p>
          <p class="text-xs text-fainter">Enter to send · / for commands · ⌘P plan mode · ⌃` terminal</p>
        </div>
      {/if}
      {#each rows as row (row.type === "group" ? row.id : row.item.id)}
        <TranscriptRow
          {row}
          {thread}
          {connLogos}
          {turnMap}
          {agentTimeline}
          {fleet}
          {onRewind}
          {onFork}
          {onOpenCompaction}
          currentMatchId={find.currentMatchId}
        />
      {/each}
      {#if rewound && rewound.settledLen !== null && rewound.threadId === thread.id}
        {@const tail = rewound.before.slice(rewound.settledLen)}
        {#if tail.length > 0}
          <div class="rewound-divider"><span>Rewound · {tail.length} item{tail.length === 1 ? "" : "s"} dropped from context</span></div>
          <div class="rewound-tail" aria-hidden="true">
            {#each tail as it (it.id)}
              <div class="rewound-item">{itemText(it).slice(0, 280) || "(…)"}</div>
            {/each}
          </div>
        {/if}
      {/if}
      {#if thread.status === "running" && !items.some((i) => i.kind === "assistant" && i.streaming) && !items.some((i) => i.kind === "tool" && i.status === "running") && !items.some((i) => i.kind === "compaction" && i.running) && !items.some((i) => i.kind === "retry" && i.running)}
        <div class="item-enter text-xs">
          <WorkingLabel label="Working…" />
        </div>
      {/if}
      {#each queues.for(thread.id).steering as steerText, i ("steer-pending-" + i)}
        <div class="item-enter flex max-w-[85%] flex-col gap-2 self-end" data-testid="pending-steer">
          <div class="group/steer relative rounded-2xl rounded-br-md border border-dashed border-border-strong/60 bg-surface-2/40 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-soft select-text">
            {steerText}
            <button
              type="button"
              class="absolute -top-2 -right-2 hidden size-5 items-center justify-center rounded-full border border-border-strong bg-surface text-muted group-hover/steer:flex hover:bg-danger hover:text-fg"
              onclick={() => api.invoke("threads:deleteSteer", thread.id, i).catch(console.error)}
              title="Cancel this steer"
              aria-label="Cancel steering message"
              data-testid="cancel-pending-steer"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
  {#if scroll.scrolledUp && scroll.didInitialScroll}
    <button
      type="button"
      class="absolute bottom-2 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-lg transition-colors hover:bg-surface-2 hover:text-fg-soft"
      onclick={() => scroll.scrollToBottom()}
      title="Scroll to bottom"
      data-testid="scroll-to-bottom"
    >
      <ArrowDownToDot size={18} />
    </button>
  {/if}
</div>

<style>
  /* Soften the transcript's bottom edge so text dissolves into the composer. */
  .transcript-scroll {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
  }
  .rewound-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.75rem 0 0.25rem;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-fainter, oklch(0.6 0 0));
  }
  .rewound-tail {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    opacity: 0.4;
    filter: grayscale(0.6);
    pointer-events: none;
  }
  .rewound-item {
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-faint, oklch(0.65 0 0));
    white-space: pre-wrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
