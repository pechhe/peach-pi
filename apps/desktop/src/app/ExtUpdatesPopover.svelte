<script lang="ts">
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { api } from "../lib/ipc";
  import { portal } from "../lib/portal";
  import PackageIcon from "@lucide/svelte/icons/package";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Check from "@lucide/svelte/icons/check";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";

  let {
    anchor,
    onClose,
    onManage,
  }: {
    anchor: HTMLElement | null;
    onClose: () => void;
    onManage: () => void;
  } = $props();

  let popoverEl: HTMLDivElement | null = $state(null);
  let pos = $state<{ top: number; left: number }>({ top: -9999, left: -9999 });
  let updating = $state(false);
  let error = $state("");
  let justUpdated = $state(false);

  // Queued flag lives on the store so closing/reopening the popover doesn't
  // lose it — the backend still has the update queued until runs finish.
  const queued = $derived(extensionUi.extUpdateQueued);

  // Updates list (from the store). Declared up here so the queued-up
  // watcher effect below reads it before first run, per Svelte 5 TDZ rules.
  const packages = $derived(extensionUi.extUpdates);

  // A queued update applies in the background once runs finish. When it does,
  // the store clears its updates list — flip into the "updated" success state.
  // The store itself clears `extUpdateQueued` on the empty-list event; here we
  // only drive the transient success UI while the popover is open.
  $effect(() => {
    if (queued && packages.length === 0) {
      justUpdated = true;
      setTimeout(() => {
        justUpdated = false;
        onClose();
      }, 1500);
    }
  });

  // Anchor to the trigger button with fixed positioning so the popover
  // escapes the sidebar's overflow clipping. Portaled to <body>.
  $effect(() => {
    if (!anchor || !popoverEl) return;
    const r = anchor.getBoundingClientRect();
    // Pop open to the left of the badge, top-aligned beneath it.
    const pw = 280;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    pos = { top: r.bottom + 4, left };
  });
  // Re-measure on viewport changes.
  $effect(() => {
    if (!anchor || !popoverEl) return;
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      const pw = 280;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      pos = { top: r.bottom + 4, left };
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  });

  function onWindowClick(e: MouseEvent) {
    if (!popoverEl) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (popoverEl.contains(target)) return;
    if (anchor && anchor.contains(target)) return; // let the toggle button handle it
    onClose();
  }

  async function updateAll() {
    if (updating) return;
    updating = true;
    error = "";
    try {
      const res = await api.invoke("app:updateExtensions");
      if (!res.ok) {
        error = res.error ?? "Update failed.";
      } else if (res.queued) {
        // Update queued: it will apply automatically when runs finish.
        // Don't close the popover — show the waiting state. The store holds
        // the flag so a close/reopen won't lose it.
        extensionUi.extUpdateQueued = true;
      } else {
        justUpdated = true;
        setTimeout(() => {
          justUpdated = false;
          onClose();
        }, 1500);
      }
    } catch (err) {
      error = String(err);
    } finally {
      updating = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} onclick={onWindowClick} />

<div
  bind:this={popoverEl}
  use:portal
  class="fixed z-60 w-[280px] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xl"
  style="top: {pos.top}px; left: {pos.left}px"
  data-testid="ext-updates-popover"
>
  <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
    <span class="text-[11px] font-semibold uppercase tracking-wide text-faint">
      Updates available
    </span>
    <span class="num-badge">
      {packages.length}
    </span>
  </div>

  {#if justUpdated}
    <div class="flex items-center gap-2 px-3 py-6 text-emerald-500">
      <Check size={16} />
      <span class="text-xs">Extensions updated. Reloading…</span>
    </div>
  {:else if queued}
    <div class="flex items-center gap-2 px-3 py-6 text-amber-400">
      <RefreshCw size={16} class="animate-spin" />
      <span class="text-xs">Update queued — will apply as soon as runs finish.</span>
    </div>
  {:else}
    <div class="flex flex-col py-1">
      {#each packages as pkg (pkg)}
        <div class="flex items-center gap-2 px-3 py-1.5">
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
            <PackageIcon size={12} />
          </span>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-soft" title={pkg}>{pkg}</span>
        </div>
      {/each}
    </div>

    {#if error}
      <div class="flex items-start gap-2 border-t border-border/60 px-3 py-2 text-danger">
        <AlertTriangle size={13} class="mt-0.5 shrink-0" />
        <span class="text-[11px] leading-tight">{error}</span>
      </div>
    {/if}

    <div class="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
      <button
        class="rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        onclick={onManage}
        data-testid="ext-updates-manage"
      >Manage…</button>
      <button
        class="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-amber-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
        onclick={updateAll}
        disabled={updating || queued}
        data-testid="ext-updates-update-all"
      >
        {#if updating}
          <RefreshCw size={12} class="animate-spin" /> Updating…
        {:else}
          <RefreshCw size={12} /> Update all
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .z-60 { z-index: 60; }
</style>
