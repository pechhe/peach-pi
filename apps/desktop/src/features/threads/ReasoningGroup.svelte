<script lang="ts">
  import ThinkingBlock from "../../app/ThinkingBlock.svelte";
  import ToolRow from "./ToolRow.svelte";
  import { groupSummary, type Row } from "./lib/group-prep-runs";

  let {
    row,
    currentMatchId,
    isRunning,
  }: {
    row: Extract<Row, { type: "group" }>;
    currentMatchId: string | null;
    isRunning: boolean;
  } = $props();

  let live = $derived(
    row.items.some(
      (it) => (it.kind === "assistant" && it.streaming) || (it.kind === "tool" && it.status === "running"),
    ),
  );
</script>

<details
  class="collapse-anim tool-enter group/tools -mb-1.5 mt-2 text-xs"
  data-item-id={row.id}
  open={live && isRunning}
>
  <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
    <span class="shrink-0 text-fainter">✓</span>
    <span class="shrink-0 font-mono font-medium text-muted"
      >{row.hasThinking ? "Reasoning" : `${row.items.length} tool calls`}</span
    >
    <span class="truncate font-mono text-fainter">{groupSummary(row.items)}</span>
    <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open/tools:rotate-90">›</span>
  </summary>
  <div class="mt-1 flex flex-col gap-1 border-l-2 border-border pl-1.5">
    {#each row.items as it (it.id)}
      {#if it.kind === "assistant"}
        <div class="item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg">
          {#if it.thinking}
            <details class="collapse-anim group mb-1 text-xs text-faint">
              <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
                <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
              </summary>
              <ThinkingBlock text={it.thinking} streaming={false} revealKey={`${it.id}:thinking`} />
            </details>
          {/if}
        </div>
      {:else if it.kind === "tool"}
        <ToolRow item={it} {currentMatchId} />
      {/if}
    {/each}
  </div>
</details>
