<script lang="ts">
  // Pinned @-connection chips shelf. Extracted from Composer.svelte (issue #55).
  // Purely presentational: renders the pinned connections and delegates removal
  // to the host (which mutates the draft).
  import type { ReferencedConnection } from "@peach-pi/shared-types";
  import X from "@lucide/svelte/icons/x";
  import ConnectorIcon from "../ConnectorIcon.svelte";

  let {
    connections,
    onRemove,
  }: {
    connections: ReferencedConnection[];
    onRemove: (index: number) => void;
  } = $props();
</script>

{#if connections.length > 0}
  <div class="mb-2 flex flex-wrap gap-2" data-testid="connections-shelf">
    {#each connections as c, i (c.integration + ":" + c.name)}
      <div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-xs text-fg-soft">
        <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={14} />
        <span class="max-w-40 truncate">@{c.name}</span>
        <button
          class="ml-0.5 text-faint hover:text-danger"
          onclick={() => onRemove(i)}
          title="Remove connection"
          aria-label="Remove connection {c.name}"
        ><X size={12} /></button>
      </div>
    {/each}
  </div>
{/if}
