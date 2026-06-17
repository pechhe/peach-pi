<script lang="ts">
  import { extensionUi } from "../stores/extension-ui.svelte";

  // Centre over the content area (right of the sidebar), not the whole window.
  let { sidebarWidth = 0 }: { sidebarWidth?: number } = $props();

  const colors = {
    info: "border-border-strong bg-surface text-fg",
    warning: "border-warning-border bg-warning-surface text-warning",
    error: "border-danger-border bg-danger-surface text-danger",
  } as const;
</script>

{#if extensionUi.toasts.length > 0}
  <div
    class="fixed top-3 z-50 flex w-80 -translate-x-1/2 flex-col gap-2"
    style="left: calc((100vw + {sidebarWidth}px) / 2)"
    data-testid="toasts"
  >
    {#each extensionUi.toasts as toast (toast.id)}
      <div
        class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl {colors[toast.level]}"
        class:cursor-pointer={toast.action}
        role={toast.action ? "button" : undefined}
        tabindex={toast.action ? 0 : undefined}
        onclick={toast.action ? () => { toast.action?.run(); extensionUi.dismiss(toast.id); } : undefined}
        onkeydown={toast.action ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toast.action?.run(); extensionUi.dismiss(toast.id); } } : undefined}
      >
        {#if toast.icon}
          {@const Icon = toast.icon}
          <Icon class="size-4 shrink-0 opacity-80" />
        {/if}
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
