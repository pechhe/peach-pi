<script lang="ts">
  import type { Snippet } from "svelte";
  import { portal } from "../lib/portal";

  // Lightweight shadcn-style tooltip (no bits-ui dependency): hover/focus to
  // reveal a dark popover above the trigger after a short delay.
  let {
    text,
    children,
    delay = 250,
    class: klass = "",
    style = "",
  }: {
    text: string;
    children?: Snippet;
    delay?: number;
    class?: string;
    style?: string;
  } = $props();

  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let triggerEl: HTMLElement | undefined;
  let popEl: HTMLElement | undefined;

  const show = () => {
    timer = setTimeout(() => (open = true), delay);
  };
  const hide = () => {
    clearTimeout(timer);
    open = false;
  };

  // Position the popover with position:fixed so it escapes ancestor scroll
  // containers (e.g. the sidebar's overflow-y-auto panels) that would clip a
  // position:absolute pop. Runs after the pop mounts (open === true).
  $effect(() => {
    if (!open) return;
    const trigger = triggerEl;
    const pop = popEl;
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    // Prefer above the trigger; fall back below if near the viewport top.
    const above = r.top - pr.height - 6;
    const below = r.bottom + 6;
    const top = above >= 8 ? above : below;
    pop.style.top = `${Math.max(8, top)}px`;
    // Center on the trigger, then clamp into the viewport so a pop near the
    // right (or left) edge isn't clipped.
    const centered = r.left + r.width / 2 - pr.width / 2;
    const maxLeft = window.innerWidth - pr.width - 8;
    pop.style.left = `${Math.round(Math.max(8, Math.min(centered, maxLeft)))}px`;
  });
</script>

<span
  class="pp-tooltip {klass}"
  {style}
  bind:this={triggerEl}
  onpointerenter={show}
  onpointerleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children?.()}
  {#if open}
    <span bind:this={popEl} use:portal class="pp-tooltip__pop" role="tooltip">{text}</span>
  {/if}
</span>
