<script lang="ts">
  import type { TranscriptItem } from "@peach-pi/shared-types";
  import BrailleSpinner from "../../app/BrailleSpinner.svelte";
  import { fmtTokens } from "./lib/group-prep-runs";

  let {
    item,
    currentMatchId,
    onOpen,
  }: {
    item: Extract<TranscriptItem, { kind: "compaction" }>;
    currentMatchId: string | null;
    onOpen: (item: Extract<TranscriptItem, { kind: "compaction" }>) => void;
  } = $props();
</script>

{#if item.running}
  <div
    class="item-enter w-full rounded-lg border border-border-strong/40 bg-surface-2/40 px-4 py-3"
    data-item-id={item.id}
    class:thread-find-hit={item.id === currentMatchId}
  >
    <div class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
      <BrailleSpinner class="working-label__spinner shrink-0" />
      {item.reason === "manual" ? "Compacting…" : "Auto-compacting…"}
    </div>
    <p class="mt-1 text-xs text-faint italic">Summarising the conversation to free up context…</p>
  </div>
{:else}
  {@const compacted = !item.error && !item.aborted}
  <button
    type="button"
    class="item-enter flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none hover:bg-surface {compacted
      ? ''
      : 'border-border-strong/30'}"
    style={compacted ? "border-color: oklch(0.6 0.16 52 / 0.45)" : ""}
    data-item-id={item.id}
    class:thread-find-hit={item.id === currentMatchId}
    data-testid="compaction-card"
    onclick={() => onOpen(item)}
  >
    <span class="shrink-0 opacity-70" style={compacted ? "color: oklch(0.6 0.16 52)" : ""}>⌘</span>
    <span
      class="font-semibold {item.error ? 'text-danger' : ''}"
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
    {#if item.tokensBefore && item.tokensAfter}
      <span class="font-medium text-faint">· {fmtTokens(item.tokensBefore)} → {fmtTokens(item.tokensAfter)} tokens</span>
    {:else if item.tokensBefore}
      <span class="font-medium text-faint">· {fmtTokens(item.tokensBefore)} summarised</span>
    {/if}
    {#if item.summary || item.error}
      <span class="ml-auto shrink-0 text-fainter">⤢</span>
    {/if}
  </button>
{/if}
