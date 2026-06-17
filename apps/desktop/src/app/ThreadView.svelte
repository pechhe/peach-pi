<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { transcripts } from "../stores/transcripts.svelte";
  import Composer from "./Composer.svelte";
  import GitWidget from "./GitWidget.svelte";
  import Workflow from "@lucide/svelte/icons/workflow";
  import ArrowDownToDot from "@lucide/svelte/icons/arrow-down-to-dot";
  import Markdown from "./Markdown.svelte";
  import StreamingText from "./StreamingText.svelte";
  import WorkingLabel from "./WorkingLabel.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { lightbox } from "../stores/lightbox.svelte";
  import { terminal } from "../stores/terminal.svelte";

  let { thread, onOpenGraph }: { thread: Thread; onOpenGraph: () => void } = $props();

  function onKeydown(e: KeyboardEvent) {
    // ⌃` toggles the integrated terminal (VS Code muscle memory).
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      terminal.toggle();
    }
  }

  let scrollEl = $state<HTMLElement | null>(null);
  let didInitialScroll = $state(false);
  // True when the user has scrolled away from the bottom of the transcript.
  let scrolledUp = $state(false);

  const items = $derived(transcripts.itemsFor(thread.id));

  const BOTTOM_THRESHOLD = 200;

  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    scrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > BOTTOM_THRESHOLD;
  }

  function scrollToBottom() {
    const el = scrollEl;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    void transcripts.ensure(thread.id);
  });

  // On open, jump to the very bottom; afterwards, only pin to bottom
  // while streaming if the user hasn't scrolled up to read history.
  $effect(() => {
    void items;
    const el = scrollEl;
    if (!el) return;
    if (!didInitialScroll) {
      // Wait for history to load before the initial jump.
      if (items.length === 0) return;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        didInitialScroll = true;
      });
      return;
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

</script>

<div class="flex h-full flex-1 flex-col">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-4">
    <h1 class="truncate text-sm font-medium text-fg-soft">{thread.title}</h1>
    {#each extensionUi.statusesFor(thread.id) as status (status)}
      <span class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted">
        {status}
      </span>
    {/each}
    <div class="ml-auto flex items-center gap-1">
      <GitWidget {thread} />
      {#if thread.projectId}
        <button
          class="rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft"
          onclick={onOpenGraph}
          title="Project knowledge graph"
          data-testid="graph-toggle"><Workflow size={14} /></button
        >
      {/if}
      <button
        class="rounded px-2 py-0.5 font-mono text-[11px] {terminal.visible
          ? 'bg-surface-2 text-fg'
          : 'text-faint hover:bg-surface hover:text-fg-soft'}"
        onclick={() => terminal.toggle()}
        title="Toggle terminal (⌃`)"
        data-testid="terminal-toggle">&gt;_</button
      >
    </div>
  </header>

  <div class="relative min-h-0 flex-1">
    <div
      bind:this={scrollEl}
      class="h-full overflow-y-auto px-6 py-5"
      data-testid="transcript"
      onscroll={onScroll}
    >
    <div class="mx-auto flex h-full max-w-3xl flex-col gap-5">
      {#if items.length === 0}
        <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p class="text-[15px] font-medium text-muted">What are we building?</p>
          <p class="text-xs text-fainter">Enter to send · / for commands · ⌘P plan mode · ⌃` terminal</p>
        </div>
      {/if}
      {#each items as item (item.id)}
        {#if item.kind === "user"}
          <div class="item-enter flex max-w-[85%] flex-col gap-2 self-end">
            {#if item.images && item.images.length > 0}
              <div class="flex flex-wrap justify-end gap-2">
                {#each item.images as img, i (i)}
                  <button
                    type="button"
                    class="block cursor-zoom-in"
                    onclick={() => lightbox.open(`data:${img.mimeType};base64,${img.data}`)}
                    title="Click to enlarge"
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt="Attached image"
                      class="h-28 w-28 rounded-lg border border-border-strong/40 object-cover"
                    />
                  </button>
                {/each}
              </div>
            {/if}
            {#if item.text}
              <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg select-text">
                {item.text}
              </div>
            {/if}
          </div>
        {:else if item.kind === "assistant"}
          <div class="item-enter text-[13.5px] leading-relaxed text-fg select-text">
            {#if item.thinking}
              <details class="group mb-2 text-xs text-faint" open={item.streaming && !item.text}>
                <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
                  <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
                </summary>
                <div class="mt-1.5 border-l-2 border-border pl-3 leading-relaxed text-faint">
                  <StreamingText text={item.thinking} streaming={item.streaming} plain />
                </div>
              </details>
            {/if}
            <StreamingText text={item.text} streaming={item.streaming} />{#if item.streaming}<span class="cursor-blink ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] rounded-full bg-fg-soft"></span>{/if}
            {#if item.error}
              <p class="mt-2 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-1.5 text-xs text-danger">{item.error}</p>
            {/if}
          </div>
        {:else if item.kind === "tool"}
          <details class="item-enter group -my-1.5 text-xs">
            <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors select-none hover:bg-surface">
              {#if item.status === "running"}
                <BrailleSpinner class="working-label__spinner shrink-0" />
              {:else if item.status === "error"}
                <span class="shrink-0 text-danger">✕</span>
              {:else}
                <span class="shrink-0 text-fainter">✓</span>
              {/if}
              <span class="shrink-0 font-mono font-medium text-muted">{item.toolName}</span>
              <span class="truncate font-mono text-fainter">{item.argsSummary}</span>
              <span class="ml-auto shrink-0 text-fainter transition-transform group-open:rotate-90">›</span>
            </summary>
            {#if item.output}
              <pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">{item.output}</pre>
            {/if}
          </details>
        {:else if item.kind === "compaction"}
          {#if item.running}
            <div class="item-enter mx-auto w-full max-w-2xl rounded-2xl border border-border-strong/40 bg-surface-2/40 px-4 py-3">
              <div class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                <BrailleSpinner class="working-label__spinner shrink-0" />
                {item.reason === "manual" ? "Compacting…" : "Auto-compacting…"}
              </div>
              <p class="mt-1 text-xs text-faint italic">Summarising the conversation to free up context…</p>
            </div>
          {:else}
            {@const compacted = !item.error && !item.aborted}
            <details class="item-enter group mx-auto w-full max-w-2xl">
              <summary
                class="flex cursor-pointer items-center gap-2 rounded-lg border bg-surface/60 px-3 py-1.5 text-xs text-muted transition-colors select-none hover:bg-surface {compacted
                  ? ''
                  : 'border-border-strong/30'}"
                style={compacted ? "border-color: oklch(0.6 0.16 52 / 0.45)" : ""}
              >
                <span class="shrink-0 opacity-70" style={compacted ? "color: oklch(0.6 0.16 52)" : ""}>⌘</span>
                <span
                  class="font-medium {item.error ? 'text-danger' : ''}"
                  style={compacted ? "color: oklch(0.6 0.16 52)" : ""}
                >
                  {item.aborted
                    ? "Compaction aborted"
                    : item.error
                      ? "Compaction failed"
                      : item.reason === "manual"
                        ? "Context compacted"
                        : "Context compacted automatically"}
                </span>
                {#if item.tokensBefore}
                  <span class="text-fainter">· {Math.round(item.tokensBefore / 1000)}k summarised</span>
                {/if}
                {#if item.summary || item.error}
                  <span class="ml-auto shrink-0 text-fainter transition-transform group-open:rotate-90">›</span>
                {/if}
              </summary>
              {#if item.error}
                <p class="mx-1 mt-1.5 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-2 text-xs text-danger">{item.error}</p>
              {:else if item.summary}
                <div class="mx-1 mt-1.5 rounded-lg border border-border/80 bg-surface/40 px-3 py-2 text-xs leading-relaxed text-fg-soft">
                  <Markdown text={item.summary} />
                </div>
              {/if}
            </details>
          {/if}
        {:else}
          <p class="item-enter text-center text-xs text-faint italic">{item.text}</p>
        {/if}
      {/each}
      {#if thread.status === "running" && !items.some((i) => i.kind === "assistant" && i.streaming)}
        <div class="item-enter text-[13px]">
          <WorkingLabel label="Thinking…" />
        </div>
      {/if}
    </div>
    </div>
    {#if scrolledUp && didInitialScroll}
      <button
        type="button"
        class="absolute bottom-2 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-lg transition-colors hover:bg-surface-2 hover:text-fg-soft"
        onclick={scrollToBottom}
        title="Scroll to bottom"
        data-testid="scroll-to-bottom"
      >
        <ArrowDownToDot size={18} />
      </button>
    {/if}
  </div>

  {#each extensionUi.widgetsFor(thread.id) as widget (widget.key)}
    <div class="mx-6 mb-1 shrink-0 rounded-lg border border-border bg-surface/60 px-3 py-2" data-testid="extension-widget">
      <pre class="overflow-x-auto font-mono text-[10px] leading-relaxed text-muted">{widget.lines.join("\n")}</pre>
    </div>
  {/each}
  <Composer {thread} />
</div>

<svelte:window onkeydown={onKeydown} />
