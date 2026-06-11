<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { transcripts } from "../stores/transcripts.svelte";
  import { api } from "../lib/ipc";

  let { thread }: { thread: Thread } = $props();

  let draft = $state("");
  let scrollEl = $state<HTMLElement | null>(null);

  const items = $derived(transcripts.itemsFor(thread.id));
  const running = $derived(thread.status === "running");

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

  async function send() {
    const text = draft.trim();
    if (!text) return;
    draft = "";
    await api.invoke("threads:prompt", thread.id, text);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
    if (e.key === "Escape" && running) {
      void api.invoke("threads:abort", thread.id);
    }
  }
</script>

<div class="flex h-full flex-1 flex-col">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-4">
    <h1 class="truncate text-sm font-medium text-zinc-300">{thread.title}</h1>
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

  <footer class="shrink-0 px-6 pb-5">
    <div class="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-zinc-500">
      <!-- Placeholder composer — full peche-pi composer port lands in Phase 2 -->
      <textarea
        class="max-h-48 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
        placeholder={running ? "Steer the run… (Enter)" : "Message… (Enter to send)"}
        bind:value={draft}
        onkeydown={onKeydown}
        data-testid="composer-input"
        rows="1"
      ></textarea>
      {#if running}
        <button
          class="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30"
          onclick={() => api.invoke("threads:abort", thread.id)}
          data-testid="abort">Stop</button
        >
      {:else}
        <button
          class="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-30"
          onclick={send}
          disabled={!draft.trim()}
          data-testid="send">Send</button
        >
      {/if}
    </div>
  </footer>
</div>
