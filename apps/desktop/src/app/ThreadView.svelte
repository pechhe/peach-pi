<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { transcripts } from "../stores/transcripts.svelte";
  import Composer from "./Composer.svelte";
  import TerminalPane from "./TerminalPane.svelte";
  import GitWidget from "./GitWidget.svelte";
  import Markdown from "./Markdown.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";

  let { thread }: { thread: Thread } = $props();

  let showTerminal = $state(false);

  function onKeydown(e: KeyboardEvent) {
    // ⌃` toggles the integrated terminal (VS Code muscle memory).
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      showTerminal = !showTerminal;
    }
  }

  let scrollEl = $state<HTMLElement | null>(null);

  const items = $derived(transcripts.itemsFor(thread.id));

  $effect(() => {
    void transcripts.ensure(thread.id);
  });

  // Pin to bottom while streaming (rAF batches layout reads under fast deltas).
  $effect(() => {
    void items;
    const el = scrollEl;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

</script>

<div class="flex h-full flex-1 flex-col">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-4">
    <h1 class="truncate text-sm font-medium text-zinc-300">{thread.title}</h1>
    {#each extensionUi.statusesFor(thread.id) as status (status)}
      <span class="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
        {status}
      </span>
    {/each}
    <div class="ml-auto flex items-center gap-1">
      <GitWidget {thread} />
      <button
        class="rounded px-2 py-0.5 font-mono text-[11px] {showTerminal
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}"
        onclick={() => (showTerminal = !showTerminal)}
        title="Toggle terminal (⌃`)"
        data-testid="terminal-toggle">&gt;_</button
      >
    </div>
  </header>

  <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-6 py-5" data-testid="transcript">
    <div class="mx-auto flex h-full max-w-3xl flex-col gap-5">
      {#if items.length === 0}
        <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p class="text-[15px] font-medium text-zinc-400">What are we building?</p>
          <p class="text-xs text-zinc-600">Enter to send · / for commands · ⌘P plan mode · ⌃` terminal</p>
        </div>
      {/if}
      {#each items as item (item.id)}
        {#if item.kind === "user"}
          <div class="item-enter max-w-[85%] self-end rounded-2xl rounded-br-md border border-zinc-700/40 bg-zinc-800/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-100 select-text">
            {item.text}
          </div>
        {:else if item.kind === "assistant"}
          <div class="item-enter text-[13.5px] leading-relaxed text-zinc-200 select-text">
            {#if item.thinking}
              <details class="group mb-2 text-xs text-zinc-500">
                <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-zinc-300">
                  <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
                </summary>
                <div class="mt-1.5 border-l-2 border-zinc-800 pl-3 leading-relaxed whitespace-pre-wrap text-zinc-500">{item.thinking}</div>
              </details>
            {/if}
            <Markdown text={item.text} />{#if item.streaming}<span class="cursor-blink ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] rounded-full bg-zinc-300"></span>{/if}
            {#if item.error}
              <p class="mt-2 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-1.5 text-xs text-red-400">{item.error}</p>
            {/if}
          </div>
        {:else if item.kind === "tool"}
          <details class="item-enter group -my-1.5 text-xs">
            <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors select-none hover:bg-zinc-900">
              {#if item.status === "running"}
                <span class="spinner size-3 shrink-0"></span>
              {:else if item.status === "error"}
                <span class="shrink-0 text-red-400">✕</span>
              {:else}
                <span class="shrink-0 text-zinc-600">✓</span>
              {/if}
              <span class="shrink-0 font-mono font-medium text-zinc-400">{item.toolName}</span>
              <span class="truncate font-mono text-zinc-600">{item.argsSummary}</span>
              <span class="ml-auto shrink-0 text-zinc-700 transition-transform group-open:rotate-90">›</span>
            </summary>
            {#if item.output}
              <pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-400 select-text">{item.output}</pre>
            {/if}
          </details>
        {:else}
          <p class="item-enter text-center text-xs text-zinc-500 italic">{item.text}</p>
        {/if}
      {/each}
      {#if thread.status === "running" && !items.some((i) => i.kind === "assistant" && i.streaming)}
        <div class="item-enter flex items-center gap-2 text-xs text-zinc-500">
          <span class="spinner size-3"></span> Working…
        </div>
      {/if}
    </div>
  </div>

  {#each extensionUi.widgetsFor(thread.id) as widget (widget.key)}
    <div class="mx-6 mb-1 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2" data-testid="extension-widget">
      <pre class="overflow-x-auto font-mono text-[10px] leading-relaxed text-zinc-400">{widget.lines.join("\n")}</pre>
    </div>
  {/each}
  {#if showTerminal}
    <TerminalPane threadId={thread.id} onClose={() => (showTerminal = false)} />
  {/if}
  <Composer {thread} />
</div>

<svelte:window onkeydown={onKeydown} />
