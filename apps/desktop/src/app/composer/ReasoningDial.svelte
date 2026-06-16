<script lang="ts">
  import type { ThinkingLevel } from "@peach-pi/shared-types";

  let {
    level,
    available,
    onCycle,
  }: {
    level: ThinkingLevel;
    available: ThinkingLevel[];
    onCycle: () => void;
  } = $props();

  const LABELS: Record<ThinkingLevel, string> = {
    off: "OFF",
    minimal: "MIN",
    low: "LOW",
    medium: "MED",
    high: "HIGH",
    xhigh: "MAX",
  };
  const ORDER: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const RADIUS = 40;

  // Spread settings around the dial: OFF anchored left (180°), the rest
  // fanned from 225° → 405°. Ported from reasoning-meter.tsx.
  function clockAngle(i: number, count: number): number {
    if (i === 0) return 180;
    if (count <= 2) return 0;
    const start = 225;
    const end = 405;
    return start + ((i - 1) * (end - start)) / Math.max(1, count - 2);
  }

  const levels = $derived.by(() => {
    const set = new Set(available.length ? available : ORDER);
    const ordered = ORDER.filter((l) => set.has(l));
    const list = ordered.length ? ordered : (["off"] as ThinkingLevel[]);
    return list.map((value, i) => {
      const a = clockAngle(i, list.length);
      const rad = (a * Math.PI) / 180;
      return {
        value,
        label: LABELS[value],
        clock: a,
        x: 50 + Math.cos(rad) * RADIUS,
        y: 50 + Math.sin(rad) * RADIUS,
      };
    });
  });

  const active = $derived(levels.find((l) => l.value === level) ?? levels[0]);
  const angle = $derived(active ? active.clock - 270 : -125);
</script>

<button
  class="reasoning-dial control-anchor"
  data-label="Reasoning"
  style="--dial-angle: {angle}deg"
  onclick={onCycle}
  title="Reasoning level (click to cycle)"
  aria-label={`Reasoning ${level}`}
  data-testid="thinking-selector"
>
  <span class="reasoning-dial__face" aria-hidden="true">
    {#each levels as entry (entry.value)}
      <span
        class="reasoning-dial__setting
          {entry.x >= 50 ? 'reasoning-dial__setting--right' : ''}
          {entry.value === level ? 'reasoning-dial__setting--active' : ''}"
        style="--sx: {entry.x}%; --sy: {entry.y}%"
      >
        <span>{entry.label}</span>
        <span class="reasoning-dial__light"></span>
      </span>
    {/each}
    <span class="reasoning-dial__knob"></span>
  </span>
</button>
