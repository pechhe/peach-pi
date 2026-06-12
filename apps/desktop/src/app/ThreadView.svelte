<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { transcripts } from "../stores/transcripts.svelte";
  import Composer from "./Composer.svelte";
  import TerminalPane from "./TerminalPane.svelte";
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

  // Pin to bottom while streaming.
  $effect(() => {
    void items;
    if (scrollEl && scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 200) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
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
    <div class="ml-auto">
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

  <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-6 py-4" data-testid="transcript">
    <div class="mx-auto flex max-w-3xl flex-col gap-4">
      {#each items as item (item.id)}
        {#if item.kind === "user"}
          <div class="self-end rounded-2xl rounded-br-sm bg-zinc-800 px-4 py-2 text-sm whitespace-pre-wrap">
            {item.text}
          </div>
        {:else if item.kind === "assistant"}
          <div class="text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
            {#if item.thinking}
              <details class="mb-2 text-xs text-zinc-500">
                <summary class="cursor-pointer">Thinking</summary>
                <div class="mt-1 whitespace-pre-wrap">{item.thinking}</div>
              </details>
            {/if}
            {item.text}{#if item.streaming}<span class="animate-pulse">▌</span>{/if}
            {#if item.error}
              <p class="mt-2 text-xs text-red-400">{item.error}</p>
            {/if}
          </div>
        {:else if item.kind === "tool"}
          <details class="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs">
            <summary class="cursor-pointer text-zinc-400">
              <span class="font-mono text-zinc-300">{item.toolName}</span>
              <span class="ml-1 text-zinc-600">{item.argsSummary}</span>
              {#if item.status === "running"}<span class="ml-1 animate-pulse text-amber-400">●</span>
              {:else if item.status === "error"}<span class="ml-1 text-red-400">✕</span>{/if}
            </summary>
            {#if item.output}
              <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-zinc-400">{item.output}</pre>
            {/if}
          </details>
        {:else}
          <p class="text-center text-xs text-zinc-500 italic">{item.text}</p>
        {/if}
      {/each}
    </div>
  </div>

  {#if showTerminal}
    <TerminalPane threadId={thread.id} onClose={() => (showTerminal = false)} />
  {/if}
  <Composer {thread} />
</div>

<svelte:window onkeydown={onKeydown} />
