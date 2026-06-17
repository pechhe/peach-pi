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
      <div
        class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl {colors[toast.level]}"
        class:cursor-pointer={toast.action}
        role={toast.action ? "button" : undefined}
        tabindex={toast.action ? 0 : undefined}
        onclick={toast.action ? () => { toast.action?.run(); extensionUi.dismiss(toast.id); } : undefined}
        onkeydown={toast.action ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toast.action?.run(); extensionUi.dismiss(toast.id); } } : undefined}
      >
        <span class="flex-1">{toast.message}</span>
        {#if toast.action}
          <button
            class="shrink-0 rounded px-2 py-0.5 font-medium underline-offset-2 hover:underline"
            onclick={(e) => {
              e.stopPropagation();
              toast.action?.run();
              extensionUi.dismiss(toast.id);
            }}>{toast.action.label}</button>
        {/if}
      </div>
    {/each}
  </div>
{/if}
