<script lang="ts">
  // Pinned @-secret chips shelf (names only; values never enter the prompt).
  // Extracted from Composer.svelte (issue #55). Presentational; removal is
  // delegated to the host.
  import type { ReferencedSecret } from "@peach-pi/shared-types";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import X from "@lucide/svelte/icons/x";

  let {
    secrets,
    onRemove,
  }: {
    secrets: ReferencedSecret[];
    onRemove: (index: number) => void;
  } = $props();
</script>

{#if secrets.length > 0}
  <div class="mb-2 flex flex-wrap gap-2" data-testid="secrets-shelf">
    {#each secrets as s, i (s.id)}
      <div class="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800">
        <KeyRound size={14} class="shrink-0" />
        <span class="max-w-40 truncate font-mono">@{s.name}</span>
        <button
          class="ml-0.5 text-amber-600/60 hover:text-danger"
          onclick={() => onRemove(i)}
          title="Remove secret"
          aria-label="Remove secret {s.name}"
        ><X size={12} /></button>
      </div>
    {/each}
  </div>
{/if}
