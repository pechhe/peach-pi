<script lang="ts">
  import type { TranscriptItem } from "@peach-pi/shared-types";
  import BrailleSpinner from "../../app/BrailleSpinner.svelte";

  let {
    item,
    currentMatchId,
  }: {
    item: Extract<TranscriptItem, { kind: "retry" }>;
    currentMatchId: string | null;
  } = $props();
</script>

<div
  class="item-enter flex w-full items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none {item.running ? 'border-border-strong/30' : 'border-danger-border/40'}"
  data-item-id={item.id}
  class:thread-find-hit={item.id === currentMatchId}
  data-testid="retry-card"
>
  {#if item.running}
    <BrailleSpinner class="working-label__spinner shrink-0" shape="triangle" size={16} dotSize={2.5} />
    <span class="font-semibold text-danger">Connection failed</span>
    <span class="font-medium text-faint">· attempt {item.attempt}/{item.maxAttempts} — retrying…</span>
  {:else}
    <span class="shrink-0 text-danger" aria-hidden="true">⚠</span>
    <span class="font-semibold text-danger">Connection failed</span>
    <span class="font-medium text-faint">· attempt {item.attempt}/{item.maxAttempts} — gave up</span>
  {/if}
  <span class="ml-auto shrink-0 text-fainter truncate max-w-[60%]" title={item.error}>{item.error}</span>
</div>
