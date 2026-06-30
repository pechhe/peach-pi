<script lang="ts">
  import type { ToolItem } from "./lib/group-prep-runs";

  let { item, currentMatchId }: { item: ToolItem; currentMatchId: string | null } = $props();
</script>

<details
  class="collapse-anim tool-enter group text-xs"
  data-item-id={item.id}
  class:thread-find-hit={item.id === currentMatchId}
>
  <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
    <span class="w-3.5 shrink-0 text-center {item.status === 'error' ? 'text-danger' : 'text-fainter'}">{item.status === "error" ? "✕" : item.status !== "running" ? "✓" : ""}</span>
    <span
      class="font-mono font-medium {item.status === 'running' ? 'tool-name--running' : 'text-muted'} {item.toolName ? 'shrink-0' : 'min-w-0 shrink truncate'}"
      >{item.toolName || item.argsSummary || "tool"}</span
    >
    {#if item.toolName}
      <span class="truncate font-mono text-fainter">{item.argsSummary}</span>
    {/if}
    <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open:rotate-90">›</span>
  </summary>
  {#if item.output}
    <pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">{item.output}</pre>
  {/if}
</details>
