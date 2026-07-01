<script lang="ts">
  // Toolkit icon for a connection row / catalogue tile. Renders the
  // integration's logo (favicon URL) when we have one; otherwise a
  // deterministic monogram tile (so a connection needs no logo to be listed).
  let {
    logoUrl = null,
    label,
    size = 20,
  }: { logoUrl?: string | null; label: string; size?: number } = $props();

  let broken = $state(false);

  // Monogram: first alphanumeric of the label, on a hue derived from the label.
  const monogram = $derived((label.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase());
  const hue = $derived([...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

{#if logoUrl && !broken}
  <img
    src={logoUrl}
    alt={label}
    width={size}
    height={size}
    class="shrink-0 rounded-md bg-white object-contain p-0.5"
    style="width:{size}px;height:{size}px"
    onerror={() => (broken = true)}
  />
{:else}
  <span
    class="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.5)}px;background:hsl({hue} 55% 45%)"
    aria-label={label}
  >{monogram}</span>
{/if}
