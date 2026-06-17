<script lang="ts">
  import type { Snippet } from "svelte";

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

  const show = () => {
    timer = setTimeout(() => (open = true), delay);
  };
  const hide = () => {
    clearTimeout(timer);
    open = false;
  };
</script>

<span
  class="pp-tooltip {klass}"
  {style}
  onpointerenter={show}
  onpointerleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children?.()}
  {#if open}
    <span class="pp-tooltip__pop" role="tooltip">{text}</span>
  {/if}
</span>
