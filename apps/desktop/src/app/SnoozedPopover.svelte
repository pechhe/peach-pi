<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import { TAG_META } from "../lib/tag-meta";

  let {
    threads,
    onSelect,
    onUnsnooze,
    onClose,
  }: {
    threads: Thread[];
    onSelect: (threadId: string) => void;
    onUnsnooze: (threadId: string) => void;
    onClose: () => void;
  } = $props();

  let popoverEl: HTMLDivElement | null = $state(null);
  let pos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

  // Anchor to the trigger button (the popover's relative wrapper) using fixed
  // positioning so it escapes the sidebar nav's overflow clipping and can be
  // wider than the sidebar, opening rightward into the main area.
  $effect(() => {
    const anchor = popoverEl?.parentElement;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + 4, left: r.left };
  });

  // Click-away close. Listener attaches after mount, so the opening click
  // (on the snooze count toggle) won't close it. Skip clicks on other snooze
  // list toggles so they can open/toggle cleanly.
  function onWindowClick(e: MouseEvent) {
    if (!popoverEl) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (popoverEl.contains(target)) return;
    if (target.closest("[data-snooze-list-toggle]")) return;
    onClose();
  }

  function timeLeft(until: string): string {
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) return "soon";
    const h = Math.floor(ms / 3_600_000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${Math.max(1, h)}h`;
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} onclick={onWindowClick} />

<div
  bind:this={popoverEl}
  class="fixed z-40 w-80 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
  style="top: {pos.top}px; left: {pos.left}px"
  data-testid="snoozed-popover"
>
  <div class="border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-fainter uppercase">
    Snoozed · {threads.length}
  </div>
  <div class="max-h-72 overflow-y-auto py-1">
    {#each threads as thread (thread.id)}
      {@const Tag = TAG_META[thread.tag ?? "other"]}
      <div class="group flex items-center gap-2 px-2 py-1 hover:bg-surface-2">
        <button
          class="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-muted hover:text-fg"
          onclick={() => {
            onSelect(thread.id);
            onClose();
          }}
        >
          <Tag.icon size={13} class="shrink-0 text-faint" />
          <span class="truncate">{thread.title || "Untitled"}</span>
        </button>
        {#if thread.snoozedUntil}
          <span class="shrink-0 text-[10px] text-fainter">{timeLeft(thread.snoozedUntil)}</span>
        {/if}
        <button
          class="shrink-0 rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
          title="Unsnooze"
          aria-label="Unsnooze"
          onclick={() => onUnsnooze(thread.id)}
        ><AlarmClock size={14} /></button>
      </div>
    {/each}
  </div>
</div>
