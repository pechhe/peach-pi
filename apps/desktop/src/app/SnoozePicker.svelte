<script lang="ts">
  let { onPick, onClose }: { onPick: (untilIso: string) => void; onClose: () => void } = $props();

  const options = [
    { label: "1 hour", ms: 3_600_000 },
    { label: "3 hours", ms: 3 * 3_600_000 },
    { label: "Tomorrow", ms: 24 * 3_600_000 },
    { label: "3 days", ms: 3 * 24 * 3_600_000 },
    { label: "1 week", ms: 7 * 24 * 3_600_000 },
  ];

  function pick(ms: number) {
    onPick(new Date(Date.now() + ms).toISOString());
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<div
  class="absolute top-full right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
  data-testid="snooze-picker"
>
  {#each options as opt (opt.label)}
    <button
      class="block w-full px-3 py-1.5 text-left text-xs text-fg-soft hover:bg-surface-2"
      onclick={() => pick(opt.ms)}>{opt.label}</button
    >
  {/each}
</div>
