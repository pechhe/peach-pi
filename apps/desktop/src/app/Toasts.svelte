<script lang="ts">
  import { extensionUi } from "../stores/extension-ui.svelte";

  const colors = {
    info: "border-zinc-700 bg-zinc-900 text-zinc-200",
    warning: "border-amber-700 bg-amber-950 text-amber-200",
    error: "border-red-700 bg-red-950 text-red-200",
  } as const;
</script>

{#if extensionUi.toasts.length > 0}
  <div class="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" data-testid="toasts">
    {#each extensionUi.toasts as toast (toast.id)}
      <div class="rounded-lg border px-3 py-2 text-xs shadow-xl {colors[toast.level]}">
        {toast.message}
      </div>
    {/each}
  </div>
{/if}
