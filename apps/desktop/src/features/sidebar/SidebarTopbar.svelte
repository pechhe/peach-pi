<script lang="ts">
  import type { AppView } from "@peach-pi/shared-types";
  import { api } from "../../lib/ipc";
  import { extensionUi } from "../../stores/extension-ui.svelte";
  import { playRotary } from "../../lib/sound/button-click-sound";
  import ExtUpdatesPopover from "../../app/ExtUpdatesPopover.svelte";
  import BellRing from "@lucide/svelte/icons/bell-ring";
  import Megaphone from "@lucide/svelte/icons/megaphone";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";
  import Search from "@lucide/svelte/icons/search";

  let {
    onOpenSearch,
    onOpenFeedback,
    onGoBack,
    onGoForward,
    onOpenView,
    canGoBack = false,
    canGoForward = false,
  }: {
    onOpenSearch: () => void;
    onOpenFeedback: () => void;
    onGoBack: () => void;
    onGoForward: () => void;
    onOpenView: (view: AppView) => void;
    canGoBack?: boolean;
    canGoForward?: boolean;
  } = $props();

  let extUpdatesAnchor: HTMLElement | null = $state(null);
  let extUpdatesOpen = $state(false);
  let reloading = $state(false);

  async function reloadAll() {
    if (reloading) return;
    reloading = true;
    try {
      const res = await api.invoke("threads:reloadAll");
      if (res.queued.length > 0) {
        extensionUi.notify(
          `Reloaded ${res.reloaded.length}; ${res.queued.length} queued for when its run finishes.`,
          undefined,
          "info",
        );
      } else if (res.reloaded.length === 0) {
        extensionUi.notify("No active sessions to reload.", undefined, "info");
      }
    } finally {
      reloading = false;
    }
  }
</script>

<!-- Search badge rides up into the titlebar strip, right-aligned to sit
     next to the page content. It's a launcher (opens ⌘K), not an input —
     kept as a compact icon + shortcut hint. Top-aligned with the page
     content card (mt-2 = 8px); the rest of the strip stays a drag region.
     Strip height clears the traffic lights (via --titlebar-content-top,
     set at boot from the native config) and divides by --zoom-factor so
     the gap stays constant under content zoom. -->
<div
  class="titlebar-drag relative shrink-0"
  style="height: calc(var(--titlebar-content-top, 40px) / var(--zoom-factor, 1))"
>
  <div class="absolute right-3 top-2 flex items-center gap-1">
    {#if extensionUi.extUpdates.length > 0}
      <button
        bind:this={extUpdatesAnchor}
        class="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-amber-400 hover:bg-surface-2 {extUpdatesOpen ? 'bg-surface-2' : ''}"
        onclick={() => { extUpdatesOpen = !extUpdatesOpen; }}
        data-testid="nav-ext-updates"
        title="{extensionUi.extUpdates.length} extension update{extensionUi.extUpdates.length === 1 ? '' : 's'} available: {extensionUi.extUpdates.join(', ')}"
      >
        <BellRing size={14} />
        <span class="num-badge num-badge--accent">{extensionUi.extUpdates.length}</span>
      </button>
    {/if}
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
      onclick={() => { playRotary(); onOpenFeedback(); }}
      data-testid="nav-feedback"
      data-press="self"
      title="Send feedback"
    >
      <Megaphone size={15} />
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      onclick={() => { playRotary(); onGoBack(); }}
      disabled={!canGoBack}
      data-testid="nav-back"
      data-press="self"
      data-kbd-hint="⌘["
      title="Back (⌘[)"
    >
      <ArrowLeft size={15} />
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      onclick={() => { playRotary(); onGoForward(); }}
      disabled={!canGoForward}
      data-testid="nav-forward"
      data-press="self"
      data-kbd-hint="⌘]"
      title="Forward (⌘])"
    >
      <ArrowRight size={15} />
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      onclick={reloadAll}
      disabled={reloading}
      data-testid="nav-reload-all"
      title="Reload extensions/skills/prompts in all sessions"
    >
      <RotateCw size={15} class={reloading ? "animate-spin" : ""} />
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
      onclick={onOpenSearch}
      data-testid="nav-search"
      data-kbd-hint="⌘K"
      title="Search (⌘K)"
    >
      <Search size={15} /><kbd class="text-[10px] text-fainter">⌘K</kbd>
    </button>
  </div>
</div>

{#if extUpdatesOpen}
  <ExtUpdatesPopover
    anchor={extUpdatesAnchor}
    onClose={() => (extUpdatesOpen = false)}
    onManage={() => { extUpdatesOpen = false; onOpenView("extensions"); }}
  />
{/if}
