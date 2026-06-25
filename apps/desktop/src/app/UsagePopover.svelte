<script lang="ts">
  import type { ProviderUsageSummary } from "@peach-pi/shared-types";
  import { usage } from "../stores/usage.svelte";
  import { usagePrefs } from "../stores/usage-prefs.svelte";
  import { metricOptions, urgencyClass, fmtResetsInDetailed } from "../lib/usage-featured";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import { portal } from "../lib/portal";

  let {
    anchor,
    onClose,
  }: {
    anchor: HTMLElement | null;
    onClose: () => void;
  } = $props();

  let popoverEl: HTMLDivElement | null = $state(null);
  let pos = $state<{ top: number; left: number }>({ top: -9999, left: -9999 });

  // Re-tick so "updated ago" stays fresh while open.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(id);
  });

  // Anchor to the trigger button with fixed positioning so the popover
  // escapes the sidebar's overflow clipping. Portaled to <body>, so an
  // explicit anchor element is required (portal severs parentElement).
  $effect(() => {
    if (!anchor || !popoverEl) return;
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + 4, left: r.left };
  });

  // Re-measure on viewport changes so the popover tracks the button.
  $effect(() => {
    if (!anchor || !popoverEl) return;
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      pos = { top: r.bottom + 4, left: r.left };
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  });

  function ago(then: string | null): string {
    if (!then) return "";
    const m = Math.floor((now - Date.parse(then)) / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  // Click-away close. Skip clicks that originate on the trigger itself so
  // toggling works without immediately reopening.
  function onWindowClick(e: MouseEvent) {
    if (!popoverEl) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (popoverEl.contains(target)) return;
    if (target.closest("[data-nav-usage-host]")) return;
    onClose();
  }

  const summaries = $derived(usage.summaries);
  // Providers hidden by the user are removed from both the popover and the
  // sidebar line. Visible here so they can be re-shown via the footer.
  const visible = $derived(summaries.filter((s) => !usagePrefs.isHidden(s.provider)));
  const hiddenCount = $derived(summaries.length - visible.length);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} onclick={onWindowClick} />

<div
  bind:this={popoverEl}
  use:portal
  class="fixed z-60 w-72 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xl"
  style="top: {pos.top}px; left: {pos.left}px"
  data-testid="usage-popover"
>
  <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
    <span class="text-[11px] font-semibold uppercase tracking-wide text-faint">Usage</span>
    <button
      class="rounded p-0.5 text-fainter transition hover:text-fg {usage.refreshing ? 'animate-spin' : ''}"
      title="Refresh all providers now"
      aria-label="Refresh usage now"
      disabled={usage.refreshing}
      onclick={() => usage.refresh()}
    ><RefreshCw size={12} /></button>
  </div>

  <div class="flex flex-col py-1 max-h-[60vh] overflow-y-auto">
    {#each visible as s (s.provider)}
      {@render providerRow(s)}
    {/each}
  </div>

  <div class="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[10px] text-fainter">
    <span>Click metrics to pin ★ (multi)</span>
    {#if hiddenCount > 0}
      <button
        class="text-fainter hover:text-fg"
        title="Show all hidden providers"
        onclick={() => usagePrefs.showAll()}
      >{hiddenCount} hidden · show all</button>
    {/if}
  </div>
</div>

{#snippet providerRow(s: ProviderUsageSummary)}
  {@const opts = metricOptions(s)}
  {@const pinned = usagePrefs.keysFor(s.provider)}
  <div class="px-3 py-1.5 {!s.configured ? 'opacity-50' : ''}">
    <div class="group flex items-center justify-between">
      <span class="text-[11px] font-medium text-fg-soft">{s.label}</span>
      <div class="flex items-center gap-1">
        <span class="text-[9px] text-fainter">{s.fetchedAt ? ago(s.fetchedAt) : ""}</span>
        {#if pinned && pinned.length > 0}
          <button
            class="rounded p-0.5 text-fainter opacity-0 transition hover:text-fg group-hover:opacity-100"
            title="Unpin all (hide from sidebar line)"
            aria-label="Unpin all metrics"
            onclick={() => usagePrefs.unpinAll(s.provider)}
          ><CircleSlash size={11} /></button>
        {/if}
        <button
          class="rounded p-0.5 text-fainter opacity-0 transition hover:text-fg group-hover:opacity-100"
          title="Hide from usage bar"
          aria-label="Hide provider"
          onclick={() => usagePrefs.toggleHidden(s.provider)}
        ><EyeOff size={11} /></button>
      </div>
    </div>
    {#if !s.configured}
      <span class="text-[10px] text-fainter">not configured</span>
    {:else if s.state === "manual"}
      {#if s.dashboardUrl}
        <a
          href={s.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline"
        >dashboard <ExternalLink size={9} class="inline" /></a>
      {:else}
        <span class="text-[10px] text-fainter">dashboard</span>
      {/if}
    {:else if opts.length === 0}
      <span class="text-[10px] text-fainter">{s.note ?? "—"}</span>
    {:else}
      <div class="mt-0.5 flex flex-wrap gap-1">
        {#each opts as o (o.key)}
          {@const isActive = pinned ? pinned.includes(o.key) : o.key === opts[0]!.key}
          <button
            class="rounded px-1.5 py-0.5 text-[10px] transition
              {isActive
                ? 'bg-surface-2 ' + urgencyClass(o.urgency)
                : 'text-fainter hover:bg-surface-2 hover:text-fg'}"
            title="{o.label} — click to toggle on sidebar"
            onclick={() => usagePrefs.pin(s.provider, o.key)}
          >
            <span class="text-fainter">{o.short}</span>
            <span class="ml-1 {isActive ? urgencyClass(o.urgency) : ''}">{o.value}<span class="text-faint"> left</span></span>
            {#if isActive}<span class="ml-0.5 text-fainter">★</span>{/if}
          </button>
        {/each}
      </div>
      {#each opts as o (o.key)}
        {@const ri = fmtResetsInDetailed(o.resetAt, now)}
        {#if ri}
          <div class="mt-0.5 text-[9px] text-fainter">
            <span class="text-faint">{o.short}</span> resets {ri === "soon" ? "soon" : "in " + ri}
          </div>
        {/if}
      {/each}
    {/if}
  </div>
{/snippet}

<style>
  .z-60 { z-index: 60; }
</style>
