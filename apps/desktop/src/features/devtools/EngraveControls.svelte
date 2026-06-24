<script lang="ts">
  import { onMount } from 'svelte';

  // sliders:
  //  1) Angle          0–90 deg     (default 78)
  //  2) Metal left L   0.5–0.95     (default 0.79)
  //  3) Metal right L  0.6–0.98     (default 0.92)
  //  4) Lip px         0–6          (default 2)
  //  5) Lip opacity    0–1          (default 0.8)
  //  6) Text ink L     0.08–0.55    (default 0.20)
  //  7) Ink chroma     0–0.08       (default 0.005)
  //  8) Ink hue        0–360        (default 250)

  let angle  = $state(78);
  let metalL = $state(0.79);
  let metalR = $state(0.92);
  let lipPx  = $state(2);
  let lipOp  = $state(0.8);
  let inkL   = $state(0.20);
  let inkC   = $state(0.005);
  let inkH   = $state(250);

  let cssEl: HTMLStyleElement | undefined;

  function buildCSS(a: number, mL: number, mR: number, px: number, op: number, iL: number, iC: number, iH: number) {
    const mRDark = 0.135 + (mR - mL) * 0.4;
    const mLDark = 0.135;
    return `
.sidebar-device {
  background:
    linear-gradient(180deg, oklch(1 0.002 ${iH} / 0.14), transparent 18%, transparent 82%, oklch(0.3 0.004 ${iH} / 0.08)),
    repeating-linear-gradient(180deg, oklch(0 0 0 / 0.03) 0 1px, oklch(1 0 0 / 0.03) 1px 2px),
    linear-gradient(${a}deg, oklch(${mL} 0.003 ${iH}) 0px, oklch(${(mL + mR) / 2} 0.003 ${iH}) 170px, oklch(${mR} 0.002 ${iH}) 340px);
  background-blend-mode: overlay, soft-light, normal;
}
:root[data-composer="dark"] .sidebar-device {
  background:
    linear-gradient(180deg, oklch(1 0.002 ${iH + 15} / 0.08), transparent 18%, transparent 82%, oklch(0 0 0 / 0.12)),
    repeating-linear-gradient(180deg, oklch(1 0 0 / 0.02) 0 1px, oklch(0 0 0 / 0.04) 1px 2px),
    linear-gradient(${a}deg, oklch(${mLDark} 0.004 ${iH + 15}) 0px, oklch(${(mLDark + mRDark) / 2} 0.004 ${iH + 15}) 170px, oklch(${mRDark} 0.004 ${iH + 15}) 340px);
  background-blend-mode: overlay, soft-light, normal;
}
.sidebar-device .main-nav-item > span,
.sidebar-device .engraved {
  color: oklch(${iL} ${iC} ${iH});
  text-shadow: 0 ${px}px 0 oklch(1 0.002 ${iH} / ${op});
}
.sidebar-device .main-nav-item > span svg,
.sidebar-device .engraved svg {
  filter: drop-shadow(0 ${px}px 0 oklch(1 0.002 ${iH} / ${op}));
}
:root[data-composer="dark"] .sidebar-device .main-nav-item > span,
:root[data-composer="dark"] .sidebar-device .engraved {
  color: oklch(${1 - iL} ${iC} ${iH + 15});
  text-shadow: 0 -${px}px 0 oklch(0 0 0 / ${op});
}
:root[data-composer="dark"] .sidebar-device .main-nav-item > span svg,
:root[data-composer="dark"] .sidebar-device .engraved svg {
  filter: drop-shadow(0 -${px}px 0 oklch(0 0 0 / ${op}));
}
/* Active engraved label lights up (one colour, both schemes) — overrides the
   machined-ink repaint above for the active nav item + Projects header. */
.sidebar-device .main-nav-item--active > span,
.sidebar-device .engraved--active {
  color: var(--engrave-active, oklch(0.74 0.185 52));
  text-shadow: 0 ${px}px 0 oklch(1 0.002 ${iH} / ${op}), 0 0 8px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
.sidebar-device .main-nav-item--active > span svg,
.sidebar-device .engraved--active svg {
  filter: drop-shadow(0 ${px}px 0 oklch(1 0.002 ${iH} / ${op})) drop-shadow(0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span,
:root[data-composer="dark"] .sidebar-device .engraved--active {
  color: var(--engrave-active, oklch(0.74 0.185 52));
  text-shadow: 0 -${px}px 0 oklch(0 0 0 / ${op}), 0 0 8px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span svg,
:root[data-composer="dark"] .sidebar-device .engraved--active svg {
  filter: drop-shadow(0 -${px}px 0 oklch(0 0 0 / ${op})) drop-shadow(0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
`;
  }

  function inject() {
    if (!cssEl) return;
    cssEl.textContent = buildCSS(angle, metalL, metalR, lipPx, lipOp, inkL, inkC, inkH);
  }

  $effect(() => { angle; metalL; metalR; lipPx; lipOp; inkL; inkC; inkH; inject(); });

  onMount(() => {
    cssEl = document.createElement('style');
    cssEl.dataset.engraveControls = 'true';
    document.head.appendChild(cssEl);
    inject();
    return () => cssEl?.remove();
  });

  // toggle show/hide
  let open = $state(true);
</script>

<div
  class="engrave-panel fixed top-3 right-3 z-[9999] w-[280px]
         rounded-lg border border-neutral-400/40 bg-neutral-100/95
         shadow-lg backdrop-blur text-neutral-800 text-xs font-sans
         dark:bg-neutral-800/95 dark:text-neutral-100 dark:border-neutral-600/40"
>
  <button
    class="flex w-full items-center justify-between px-3 py-2
           font-semibold text-[11px] uppercase tracking-widest"
    onclick={() => open = !open}
  >
    Engrave Controls
    <span class="text-neutral-400">{open ? '▾' : '▸'}</span>
  </button>

  {#if open}
    <div class="flex flex-col gap-3 px-3 pb-3">
      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Gradient angle: {angle}°</span>
        <input type="range" min="0" max="90" step="1" bind:value={angle} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Metal left L: {metalL.toFixed(3)}</span>
        <input type="range" min="0.5" max="0.95" step="0.005" bind:value={metalL} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Metal right L: {metalR.toFixed(3)}</span>
        <input type="range" min="0.6" max="0.98" step="0.005" bind:value={metalR} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Lip size: {lipPx}px</span>
        <input type="range" min="0" max="6" step="0.5" bind:value={lipPx} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Lip opacity: {lipOp.toFixed(2)}</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={lipOp} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Ink lightness: {inkL.toFixed(3)}</span>
        <input type="range" min="0.08" max="0.55" step="0.005" bind:value={inkL} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Ink chroma: {inkC.toFixed(3)}</span>
        <input type="range" min="0" max="0.08" step="0.001" bind:value={inkC} />
      </label>

      <label class="flex flex-col gap-0.5">
        <span class="text-[10px] text-neutral-500">Ink hue: {inkH.toFixed(0)}°</span>
        <input type="range" min="0" max="360" step="1" bind:value={inkH} />
      </label>
    </div>
  {/if}
</div>
