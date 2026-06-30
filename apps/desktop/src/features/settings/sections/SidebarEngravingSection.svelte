<script lang="ts">
  import { onMount } from "svelte";

  /*
   * Sidebar engraving overrides (live-tuned via the sliders below).
   * The values are injected as a <style> tag in <head> so they override
   * sidebar-device.css in real time, for both light and dark composer schemes.
   */
  let engrave = $state({
    angle: 78, metalL: 0.79, metalR: 0.92,
    lipPx: 2, lipOp: 0.8, inkL: 0.20, inkC: 0.005, inkH: 250,
  });
  let engraveStyleEl: HTMLStyleElement | undefined;

  function buildEngraveCSS(a: number, mL: number, mR: number, px: number, op: number, iL: number, iC: number, iH: number) {
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
  text-shadow: 0 ${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 35%, oklch(1 0.002 ${iH} / ${op})), 0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
.sidebar-device .main-nav-item--active > span svg,
.sidebar-device .engraved--active svg {
  filter: drop-shadow(0 ${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 35%, oklch(1 0.002 ${iH} / ${op}))) drop-shadow(0 0 5px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span,
:root[data-composer="dark"] .sidebar-device .engraved--active {
  color: var(--engrave-active, oklch(0.74 0.185 52));
  text-shadow: 0 -${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 30%, oklch(0 0 0 / ${op})), 0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span svg,
:root[data-composer="dark"] .sidebar-device .engraved--active svg {
  filter: drop-shadow(0 -${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 30%, oklch(0 0 0 / ${op}))) drop-shadow(0 0 5px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
`;
  }
  function injectEngraveCSS() {
    if (!engraveStyleEl) return;
    const { angle, metalL, metalR, lipPx, lipOp, inkL, inkC, inkH } = engrave;
    engraveStyleEl.textContent = buildEngraveCSS(angle, metalL, metalR, lipPx, lipOp, inkL, inkC, inkH);
  }
  $effect(() => { engrave.angle; engrave.metalL; engrave.metalR; engrave.lipPx; engrave.lipOp; engrave.inkL; engrave.inkC; engrave.inkH; injectEngraveCSS(); });
  onMount(() => {
    engraveStyleEl = document.createElement('style');
    engraveStyleEl.dataset.engraveControls = 'true';
    document.head.appendChild(engraveStyleEl);
    injectEngraveCSS();
    return () => engraveStyleEl?.remove();
  });
</script>

<div class="mb-3">
  <h2 class="text-sm text-fg">Sidebar engraving</h2>
  <p class="text-xs text-faint">Tune the sidebar metal surface and letterpress text. Values override sidebar-device.css in real time.</p>
</div>
<div class="grid grid-cols-2 gap-x-6 gap-y-3">
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Gradient angle: {engrave.angle}°</span>
    <input type="range" class="accent-primary" min="0" max="90" step="1" bind:value={engrave.angle} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Metal left L: {engrave.metalL.toFixed(3)}</span>
    <input type="range" class="accent-primary" min="0.5" max="0.95" step="0.005" bind:value={engrave.metalL} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Metal right L: {engrave.metalR.toFixed(3)}</span>
    <input type="range" class="accent-primary" min="0.6" max="0.98" step="0.005" bind:value={engrave.metalR} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Lip size: {engrave.lipPx}px</span>
    <input type="range" class="accent-primary" min="0" max="6" step="0.5" bind:value={engrave.lipPx} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Lip opacity: {engrave.lipOp.toFixed(2)}</span>
    <input type="range" class="accent-primary" min="0" max="1" step="0.05" bind:value={engrave.lipOp} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Ink lightness: {engrave.inkL.toFixed(3)}</span>
    <input type="range" class="accent-primary" min="0.08" max="0.55" step="0.005" bind:value={engrave.inkL} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Ink chroma: {engrave.inkC.toFixed(3)}</span>
    <input type="range" class="accent-primary" min="0" max="0.08" step="0.001" bind:value={engrave.inkC} />
  </label>
  <label class="flex flex-col gap-0.5">
    <span class="text-[11px] text-fainter">Ink hue: {engrave.inkH.toFixed(0)}°</span>
    <input type="range" class="accent-primary" min="0" max="360" step="1" bind:value={engrave.inkH} />
  </label>
</div>
