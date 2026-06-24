<script lang="ts">
  import type { TranscriptItem } from "@peach-pi/shared-types";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import Icon from "./Icon.svelte";

  let { item }: { item: TranscriptItem } = $props();

  let showThinking = $state(false);
  let showTool = $state(false);

  marked.setOptions({ breaks: true, gfm: true });

  function md(src: string): string {
    return DOMPurify.sanitize(marked.parse(src ?? "", { async: false }) as string);
  }
</script>

{#if item.kind === "user"}
  <div class="self-end max-w-[80%] rounded-2xl bg-bubble px-[15px] py-[11px]">
    <div class="whitespace-pre-wrap text-[14.5px] leading-[1.5]">{item.text}</div>
  </div>
{:else if item.kind === "assistant"}
  {#if item.thinking}
    <button class="flex items-center gap-1.5 text-[13px] text-faint" onclick={() => (showThinking = !showThinking)}>
      <span class="transition-transform" style="transform: rotate({showThinking ? 90 : 0}deg)">
        <Icon name="chevron-right" size={9} sw={1.5} />
      </span>
      <span>Thinking</span>
    </button>
    {#if showThinking}
      <div class="whitespace-pre-wrap pl-3.5 font-mono text-[13px] leading-[1.5] text-faint">
        {item.thinking}
      </div>
    {/if}
  {/if}
  <div class="md">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html md(item.text)}{#if item.streaming}<span class="pp-caret"></span>{/if}
  </div>
  {#if item.error}
    <div class="text-[12px] text-danger">{item.error}</div>
  {/if}
{:else if item.kind === "tool"}
  <div class="overflow-hidden rounded-[10px] border border-border">
    <button class="flex w-full items-center gap-2 bg-surface-2/60 px-3 py-2.5 text-left text-[13px]" onclick={() => (showTool = !showTool)}>
      <span class="shrink-0 {item.status === 'error' ? 'text-danger' : 'text-success'}">
        {#if item.status === "running"}
          <Icon name="spinner" size={13} sw={3} />
        {:else if item.status === "error"}
          <Icon name="alert-circle" size={13} sw={1.6} />
        {:else}
          <Icon name="check" size={13} />
        {/if}
      </span>
      <span class="font-mono text-accent">{item.toolName}</span>
      <span class="flex-1 truncate font-mono text-faint">{item.argsSummary}</span>
      <span class="shrink-0 text-fainter transition-transform" style="transform: rotate({showTool ? 90 : 0}deg)">
        <Icon name="chevron-right" size={12} sw={2} />
      </span>
    </button>
    {#if showTool && item.output}
      <pre class="overflow-x-auto border-t border-border bg-surface px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-fg-soft">{item.output}</pre>
    {/if}
  </div>
{:else if item.kind === "subagent"}
  <div class="flex items-center gap-2 text-[13px] text-faint">
    <Icon name="git-branch" size={13} sw={1.6} />
    <span>{item.rows.length} {item.rows.length === 1 ? "agent" : "agents"} · {item.verb}</span>
  </div>
{:else if item.kind === "compaction"}
  <div class="text-[11px] italic text-faint">
    {item.running ? "Compacting context…" : "Context compacted"}
  </div>
{:else if item.kind === "notice"}
  <div class="text-[11px] text-faint">{item.text}</div>
{/if}
