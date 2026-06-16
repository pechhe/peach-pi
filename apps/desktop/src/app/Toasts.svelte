<script lang="ts">
  import { extensionUi } from "../stores/extension-ui.svelte";

  const colors = {
    info: "border-border-strong bg-surface text-fg",
    warning: "border-warning-border bg-warning-surface text-warning",
    error: "border-danger-border bg-danger-surface text-danger",
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
