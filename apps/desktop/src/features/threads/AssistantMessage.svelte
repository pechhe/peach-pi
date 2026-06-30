<script lang="ts">
  import type { Thread, TranscriptItem } from "@peach-pi/shared-types";
  import type { TurnMap } from "../../lib/transcript/turns";
  import { codeCopy, clickCopy } from "../../lib/code-copy";
  import { fmtTokens, fmtCost } from "./lib/group-prep-runs";
  import StreamingText from "../../app/StreamingText.svelte";
  import ThinkingBlock from "../../app/ThinkingBlock.svelte";
  import CopyButton from "../../app/CopyButton.svelte";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";

  let {
    item,
    currentMatchId,
    thread,
    turnMap,
    onRewind,
    onFork,
  }: {
    item: Extract<TranscriptItem, { kind: "assistant" }>;
    currentMatchId: string | null;
    thread: Thread;
    turnMap: TurnMap;
    onRewind: (entryId: string) => void;
    onFork: (entryId: string) => void;
  } = $props();

  // Guard against a stuck cursor: a dropped/late message_end leaves
  // item.streaming true forever. The thread can only have one open assistant
  // message, so once the thread is no longer running no item is genuinely
  // streaming.
  let isStreaming = $derived(item.streaming && thread.status === "running");
  // Thinking phase: still streaming with reasoning but no answer text yet.
  let inThinking = $derived(isStreaming && !!item.thinking && !item.text);
</script>

<div
  class="item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg select-text"
  data-item-id={item.id}
  class:thread-find-hit={item.id === currentMatchId}
  use:codeCopy={!isStreaming}
>
  {#if item.thinking}
    <details class="collapse-anim group mb-1 text-xs text-faint" open={isStreaming && !item.text}>
      <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
        <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
      </summary>
      <ThinkingBlock text={item.thinking} streaming={isStreaming} cursor={inThinking} revealKey={`${item.id}:thinking`} />
    </details>
  {/if}
  <StreamingText text={item.text} streaming={isStreaming} cursor={isStreaming && !inThinking} revealKey={`${item.id}:text`} />
  {#if item.error}
    <p class="mt-2 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-1.5 text-xs text-danger" use:clickCopy={item.error}>{item.error}</p>
  {/if}
  {#if !isStreaming && item.text}
    <div class="assistant-actions">
      <CopyButton text={item.text} />
      {#if thread.status !== "running" && turnMap.endById.has(item.id) && !thread.remoteHostId}
        {@const t = turnMap.endById.get(item.id)!}
        <button
          type="button"
          class="copy-btn"
          onclick={() => onRewind(t.entryId)}
          title="Rewind the conversation to before this turn"
          data-testid="rewind-turn"
        >
          <Undo2 size={13} /> <span>Rewind</span>
        </button>
        <button
          type="button"
          class="copy-btn"
          onclick={() => onFork(t.entryId)}
          title="Fork into a new thread at this point"
          data-testid="fork-turn"
        >
          <GitBranch size={13} /> <span>Fork</span>
        </button>
      {/if}
      {#if item.usage}
        {@const u = item.usage}
        {@const totalInput = u.input + u.cacheRead + u.cacheWrite}
        {@const cachePct = totalInput > 0 ? Math.round((u.cacheRead / totalInput) * 100) : 0}
        <div
          class="assistant-usage"
          data-testid="assistant-usage"
          title={`${u.input} fresh + ${u.cacheWrite} cache write + ${u.cacheRead} cache read = ${totalInput} input · ${u.output} output${u.costUsd != null ? ` · ${fmtCost(u.costUsd)} estimated equivalent API cost` : ""}`}
        >
          <span class="usage-stat"><ArrowUp size={11} />{fmtTokens(totalInput)}</span>
          {#if cachePct > 0}<span class="usage-stat">({cachePct}% cached)</span>{/if}
          <span class="usage-stat"><ArrowDown size={11} />{fmtTokens(u.output)}</span>
          {#if u.tokensPerSec}<span>· {u.tokensPerSec.toFixed(1)} tok/s</span>{/if}
          {#if u.ttftMs != null}<span>· {(u.ttftMs / 1000).toFixed(2)}s to first</span>{/if}
          {#if u.costUsd != null}<span>· {fmtCost(u.costUsd)}</span>{/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
