<script lang="ts">
  import { sendMessage, steerMessage, abortRun, deleteQueued } from "../lib/api.ts";
  import type { Master } from "../lib/store.svelte.ts";
  import Icon from "./Icon.svelte";

  let {
    master,
    threadId,
    running,
    followUp,
    onError,
  }: {
    master: Master;
    threadId: string;
    running: boolean;
    followUp: string[];
    onError: (msg: string) => void;
  } = $props();

  let text = $state("");
  let sending = $state(false);
  // Steer = inject into the running turn now, vs. the default queue-as-follow-up.
  let steer = $state(false);
  let ta = $state<HTMLTextAreaElement | null>(null);

  const hasText = $derived(text.trim().length > 0);
  // Empty + running → the button stops the run (mirrors the desktop send-dial).
  const isStop = $derived(running && !hasText);

  function grow(): void {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  async function submit(): Promise<void> {
    if (isStop) return void stop();
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    try {
      if (steer && running) await steerMessage(master, threadId, body);
      else await sendMessage(master, threadId, body);
      text = "";
      queueMicrotask(grow);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      sending = false;
    }
  }

  async function stop(): Promise<void> {
    try {
      await abortRun(master, threadId);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function dropQueued(index: number): Promise<void> {
    try {
      await deleteQueued(master, threadId, "followUp", index);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    // Enter sends; Shift+Enter newlines. (Soft keyboards mostly send a newline,
    // so the button is the primary affordance — this just helps hardware ones.)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div class="border-t border-border bg-bg px-3 pt-2.5 pb-3">
  {#if followUp.length > 0}
    <div class="mb-2 flex flex-col gap-1.5">
      {#each followUp as msg, i (i)}
        <div class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <span class="shrink-0 text-fainter"><Icon name="message" size={12} sw={1.7} /></span>
          <span class="min-w-0 flex-1 truncate text-[12px] text-muted">{msg}</span>
          <span class="shrink-0 text-[10px] font-medium text-fainter">queued</span>
          <button
            class="-mr-0.5 shrink-0 text-fainter"
            onclick={() => dropQueued(i)}
            aria-label="Remove queued message"
          >
            <Icon name="x" size={13} sw={2} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex items-end gap-2">
    <div class="flex min-w-0 flex-1 items-end rounded-[20px] border border-border bg-surface px-3.5 py-2">
      <textarea
        bind:this={ta}
        bind:value={text}
        oninput={grow}
        onkeydown={onKeydown}
        rows="1"
        placeholder={running ? (steer ? "steer the running turn…" : "queue a follow-up…") : "Message…"}
        class="max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[15px] leading-[1.4] text-fg outline-none placeholder:text-fainter"
      ></textarea>
    </div>

    {#if running && hasText}
      <button
        class="mb-px shrink-0 rounded-full border px-2.5 py-2 text-[11px] font-medium transition-colors {steer
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-surface text-faint'}"
        onclick={() => (steer = !steer)}
        aria-pressed={steer}
        title="Steer the running turn instead of queuing"
      >
        steer
      </button>
    {/if}

    <button
      class="mb-px flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors {isStop
        ? 'bg-danger text-white'
        : hasText
          ? 'bg-accent text-white'
          : 'bg-surface-2 text-fainter'}"
      onclick={submit}
      disabled={!isStop && (!hasText || sending)}
      aria-label={isStop ? "Stop run" : "Send message"}
    >
      {#if sending}
        <Icon name="spinner" size={18} sw={3} />
      {:else if isStop}
        <Icon name="stop" size={16} />
      {:else}
        <Icon name="send" size={18} sw={2} />
      {/if}
    </button>
  </div>
</div>
