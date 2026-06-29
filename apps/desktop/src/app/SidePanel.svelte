<script lang="ts">
  import type { ModelInfo } from "@peach-pi/shared-types";
  import { quintOut } from "svelte/easing";
  import { sideChat } from "../stores/side-chat.svelte";
  import { api } from "../lib/ipc";
  import Markdown from "./Markdown.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import History from "@lucide/svelte/icons/history";
  import X from "@lucide/svelte/icons/x";

  let { threadId }: { threadId: string | null } = $props();

  let showHistory = $state(false);

  // Subdued starter prompts shown in the empty state.
  const suggestions = [
    "What file should I edit?",
    "Explain this function",
    "Check this decision",
  ];

  let models = $state<ModelInfo[]>([]);
  let modelsLoadedFor: string | null = null;

  const conv = $derived(sideChat.active);

  // Load the model list (override picker) once per thread the panel points at.
  $effect(() => {
    const threadId = sideChat.threadId;
    if (sideChat.open && threadId && modelsLoadedFor !== threadId) {
      modelsLoadedFor = threadId;
      void api.invoke("threads:listAllModels", threadId).then((m) => (models = m));
    }
  });

  async function useSuggestion(text: string) {
    if (sideChat.streaming) return;
    await sideChat.ask(text);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      sideChat.close();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sideChat.submitDraft();
    }
  }

  // Focus the input as soon as the panel mounts so the user can type
  // immediately. rAF waits for the fly-in transition to attach the node.
  function focusOnMount(node: HTMLTextAreaElement) {
    requestAnimationFrame(() => node.focus());
  }

  async function onPickModel(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    const model = models.find((m) => `${m.provider}/${m.id}` === value) ?? null;
    await sideChat.startNew(model);
  }

  // Buttery reveal: animate the clip's width so the main content gives way
  // smoothly and the panel grows out from the right (the inner panel is pinned
  // to the right edge, so it never reflows or snaps).
  function slidePanel(node: HTMLElement, { duration = 320 } = {}) {
    const full = node.getBoundingClientRect().width || 368;
    return {
      duration,
      easing: quintOut,
      css: (t: number) => `width:${t * full}px;`,
    };
  }
</script>

{#if sideChat.open && sideChat.threadId === threadId}
  <aside
    class="relative my-2 mr-2 w-[23rem] shrink-0 overflow-hidden rounded-[16px]"
    transition:slidePanel
    onkeydown={onKeydown}
    tabindex="-1"
  >
    <div
      class="btw-panel absolute inset-y-0 right-0 flex w-[23rem] flex-col overflow-hidden rounded-[16px] border border-border bg-surface"
    >
    <button
      class="absolute right-1.5 top-1.5 z-10 rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
      onclick={() => sideChat.close()}
      title="Close"
      aria-label="Close side conversation"
    >
      <X class="size-3.5" />
    </button>
    <!-- Toolbar -->
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <button
        class="flex items-center gap-1 rounded border border-border-strong px-2 py-1 text-xs text-muted hover:bg-surface-2"
        onclick={() => sideChat.startNew()}
      >
        <Plus class="size-3" /> New
      </button>
      <button
        class="flex items-center gap-1 rounded border border-border-strong px-2 py-1 text-xs text-muted hover:bg-surface-2"
        class:bg-surface-2={showHistory}
        onclick={() => (showHistory = !showHistory)}
      >
        <History class="size-3" /> History
      </button>
      <select
        class="ml-auto max-w-[9.5rem] truncate rounded border border-border-strong bg-surface px-1.5 py-1 text-xs text-muted"
        value={conv?.model ? `${conv.model.provider}/${conv.model.id}` : ""}
        onchange={onPickModel}
        title="Model for this side chat"
      >
        {#if !conv?.model}<option value="">default model</option>{/if}
        {#each models as m (m.provider + "/" + m.id)}
          <option value={`${m.provider}/${m.id}`}>{m.name}</option>
        {/each}
      </select>
    </div>

    {#if showHistory}
      <div class="border-b border-border bg-bg/40 px-3 py-2">
        <p class="mb-1 text-[10px] font-semibold tracking-wide text-fainter uppercase">
          btw history
        </p>
        {#if sideChat.history.length === 0}
          <p class="text-xs text-fainter">No past side chats for this thread.</p>
        {:else}
          <ul class="flex flex-col gap-0.5">
            {#each sideChat.history as h (h.id)}
              <li class="group flex items-center gap-1">
                <button
                  class="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-xs hover:bg-surface-2 {conv?.id ===
                  h.id
                    ? 'text-fg'
                    : 'text-muted'}"
                  onclick={() => sideChat.openConv(h.id)}
                >
                  {h.title || "Untitled"}
                </button>
                <button
                  class="rounded p-1 text-fainter opacity-0 group-hover:opacity-100 hover:text-danger"
                  onclick={() => sideChat.deleteConv(h.id)}
                  title="Delete"
                >
                  <Trash2 class="size-3" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto px-4 py-3">
      {#if conv && conv.messages.length === 0 && !sideChat.streaming}
        <div class="flex h-full flex-col items-center justify-center px-2 pb-12">
          <div
            class="w-full max-w-[17rem] rounded-2xl border border-border bg-surface-2/60 px-5 py-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]"
          >
            <span
              class="mx-auto mb-3 flex size-9 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold tracking-wide text-accent uppercase"
            >
              btw
            </span>
            <p class="text-sm font-semibold text-fg">Ask a quick side question</p>
            <p class="mt-1 text-xs text-faint">It won't touch the main conversation.</p>
            <div class="mt-4 flex flex-wrap justify-center gap-1.5">
              {#each suggestions as s (s)}
                <button
                  class="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  onclick={() => useSuggestion(s)}
                >
                  {s}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
      {#if conv}
        <div class="flex flex-col gap-3">
          {#each conv.messages as m, i (i)}
            {#if m.role === "user"}
              <div class="self-end rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-soft">
                {m.text}
              </div>
            {:else}
              <div class="border-l-2 border-accent/40 pl-3 text-sm text-fg-soft">
                <Markdown text={m.text} />
              </div>
            {/if}
          {/each}
          {#if sideChat.streaming}
            <div class="border-l-2 border-accent/40 pl-3 text-sm text-fg-soft">
              {#if sideChat.buffer}
                <Markdown text={sideChat.buffer} />
              {:else}
                <span class="text-fainter">thinking…</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      {#if sideChat.error}
        <p class="mt-3 rounded border border-danger-border bg-danger-surface px-2 py-1.5 text-xs text-danger">
          {sideChat.error}
        </p>
      {/if}
    </div>

    <!-- Input — reuses the composer chassis + cream screen for a single-line
         field. The fixed BTW cap floats over the screen's right edge and acts
         as the send button (room reserved via padding-right). -->
    <div class="composer-device border-t border-border p-3">
      <div class="composer__surface btw-input">
        <div class="composer__screen btw-input__screen">
          <textarea
            bind:value={sideChat.draft}
            onkeydown={onKeydown}
            rows="1"
            use:focusOnMount
            placeholder="Ask a side question…"
          ></textarea>
        </div>
      </div>
    </div>
    </div>
  </aside>
{/if}

<style>
  /* Grow from the BTW button's corner; soft circular shadow echoes the cap. */
  .btw-panel {
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.12),
      -2px 6px 16px -6px rgba(0, 0, 0, 0.22),
      -6px 14px 40px -16px rgba(0, 0, 0, 0.28);
  }
</style>
