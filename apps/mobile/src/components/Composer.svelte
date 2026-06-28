<script lang="ts">
  import { sendMessage, steerMessage, abortRun, deleteQueued } from "../lib/api.ts";
  import type { ModelInfo, ScopedModel, ThinkingLevel } from "@peach-pi/shared-types";
  import type { Master } from "../lib/store.svelte.ts";
  import Icon from "./Icon.svelte";
  import ModelPicker from "./ModelPicker.svelte";

  let {
    master,
    threadId,
    running,
    followUp,
    models,
    sessionModel,
    sessionThinking,
    availableThinking,
    onError,
  }: {
    master: Master;
    threadId: string;
    running: boolean;
    followUp: string[];
    models: ScopedModel[];
    sessionModel: ModelInfo | null;
    sessionThinking: ThinkingLevel;
    availableThinking: ThinkingLevel[];
    onError: (msg: string) => void;
  } = $props();

  let text = $state("");
  let sending = $state(false);
  // Steer = inject into the running turn now, vs. the default queue-as-follow-up.
  let steer = $state(false);
  let ta = $state<HTMLTextAreaElement | null>(null);

  // Composer-local override state (null = use the master's session default).
  // Persists until send (override applies to that message) or reset button.
  let overrideModel = $state<ModelInfo | null>(null);
  let overrideThinking = $state<ThinkingLevel | null>(null);
  let showPicker = $state(false);

  const THINKING_LABEL: Record<ThinkingLevel, string> = {
    off: "Off",
    minimal: "Min",
    low: "Low",
    medium: "Med",
    high: "High",
    xhigh: "Max",
  };

  const activeModel = $derived(overrideModel ?? sessionModel);
  const activeThinking = $derived(overrideThinking ?? sessionThinking);
  const pillLabel = $derived(activeModel?.name || activeModel?.id || "default");

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
      else {
        // Only forward an override when the user set one this turn.
        const opts: { model?: ModelInfo; thinking?: ThinkingLevel } = {};
        if (overrideModel) opts.model = overrideModel;
        if (overrideThinking) opts.thinking = overrideThinking;
        await sendMessage(master, threadId, body, Object.keys(opts).length ? opts : undefined);
        // Override applied on the master; subsequent turns use the session default.
        overrideModel = null;
        overrideThinking = null;
      }
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

  <div class="flex items-center gap-1.5 pb-1.5">
    <button
      class="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-faint transition-colors hover:bg-surface-2"
      onclick={() => (showPicker = true)}
      aria-label="Model & reasoning"
      title="Model & reasoning"
    >
      <span class="max-w-[42vw] truncate text-fg">{pillLabel}</span>
      <span class="text-fainter">·</span>
      <span class="uppercase tracking-wide text-faint">{THINKING_LABEL[activeThinking]}</span>
      <span class="text-fainter"><Icon name="chevron-down" size={11} sw={2} /></span>
    </button>
    {#if overrideModel || overrideThinking}
      <button
        class="shrink-0 rounded-full border border-border bg-surface px-2 py-1 text-[11px] text-faint"
        onclick={() => { overrideModel = null; overrideThinking = null; }}
        title="Reset to session default"
      >reset</button>
    {/if}
  </div>

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

{#if showPicker}
  <ModelPicker
    {models}
    selected={activeModel}
    thinking={activeThinking}
    availableThinking={availableThinking}
    onSelectModel={(m) => { overrideModel = m; showPicker = false; }}
    onSetThinking={(t) => { overrideThinking = t; }}
    onClose={() => (showPicker = false)}
  />
{/if}
