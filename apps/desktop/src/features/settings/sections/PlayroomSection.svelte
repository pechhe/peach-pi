<script lang="ts">
  let { onOpenPlayroom }: { onOpenPlayroom?: () => void } = $props();
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Appearance Playroom</h2>
    <p class="text-xs text-faint">A live, isolated stage for tuning how the app looks and feels — send messages, mark done, fire alerts.</p>
  </div>
  <button
    class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg transition-colors hover:bg-surface-3"
    onclick={onOpenPlayroom}
    data-testid="settings-open-playroom"
  >Open</button>
</div>
