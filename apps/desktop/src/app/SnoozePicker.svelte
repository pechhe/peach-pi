<script lang="ts">
  let {
    anchor,
    onPick,
    onClose,
  }: {
    anchor: HTMLElement | null;
    onPick: (untilIso: string) => void;
    onClose: () => void;
  } = $props();

  let pickerEl: HTMLDivElement | null = $state(null);
  // Off-screen until first measurement so a fixed box never flashes at 0,0.
  let pos = $state<{ top: number; left: number } | null>(null);

  // Click-away close. The listener attaches after mount, so the opening click
  // (on the snooze toggle) has already finished propagating and won't close.
  // Skip clicks on other snooze toggles so they can open/toggle cleanly.
  function onWindowClick(e: MouseEvent) {
    if (!pickerEl) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (pickerEl.contains(target)) return;
    if (anchor?.contains(target)) return;
    if (target.closest("[data-snooze-toggle]")) return;
    onClose();
  }

  const WIDTH = 128; // w-32
  const GAP = 4;
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

  // Fixed positioning escapes every overflow ancestor (project body
  // overflow:hidden, chats max-h-48 overflow-auto, sidebar nav overflow-y-auto)
  // that otherwise clipped the picker to a couple of options. Flip upward when
  // there's no room below. Close on scroll rather than chase the anchor —
  // standard for transient menus and avoids the picker drifting off the anchor.
  $effect(() => {
    if (!anchor || !pickerEl) return;
    const r = anchor.getBoundingClientRect();
    const h = pickerEl.offsetHeight;
    const spaceBelow = window.innerHeight - r.bottom;
    const top =
      spaceBelow < h + GAP && r.top >= h + GAP ? r.top - h - GAP : r.bottom + GAP;
    const left = Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8));
    pos = { top, left };
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} onclick={onWindowClick} />

<div
  bind:this={pickerEl}
  class="fixed z-50 w-32 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
  style:top={pos ? `${pos.top}px` : "-9999px"}
  style:left={pos ? `${pos.left}px` : undefined}
  data-testid="snooze-picker"
>
  {#each options as opt (opt.label)}
    <button
      class="block w-full px-3 py-1.5 text-left text-xs text-fg-soft hover:bg-surface-2"
      onclick={() => pick(opt.ms)}>{opt.label}</button
    >
  {/each}
</div>
