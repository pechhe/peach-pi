<script lang="ts">
  // Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
  // Verbatim structure. peach-pi's Toasts.svelte drives this with
  // placement="static" inside its own sidebar-aware positioned wrapper, so the
  // portal path is unused in practice — kept for completeness.
  import { AnimatePresence } from "motion-sv";
  import { portal } from "./portal";
  import { cn } from "../utils";
  import type { Snippet } from "svelte";
  import type {
    AnimatedToast,
    ToastClassNames,
    ToastPosition,
    ToastStatus,
  } from "./use-animated-toast-stack.svelte";
  import ToastItem from "./toast-item.svelte";

  const POSITION_CLASS: Record<ToastPosition, string> = {
    "top-left": "left-4 top-4",
    "top-center": "left-1/2 top-4 -translate-x-1/2",
    "top-right": "right-4 top-4",
    "bottom-left": "bottom-6 left-4",
    "bottom-center": "bottom-6 left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-6 right-4",
  };

  interface AnimatedToastStackProps {
    toasts: AnimatedToast[];
    onDismiss?: (id: string) => void;
    position?: ToastPosition;
    placement?: "static" | "fixed" | "absolute";
    fixed?: boolean;
    portal?: boolean;
    portalTarget?: HTMLElement | null;
    maxVisible?: number;
    class?: string;
    classNames?: ToastClassNames;
    icons?: Partial<Record<ToastStatus, Snippet>>;
    renderToast?: (toast: AnimatedToast) => Snippet;
  }

  let {
    toasts,
    onDismiss,
    position = "bottom-right",
    placement,
    fixed = false,
    portal: portalProp,
    portalTarget = null,
    maxVisible = 4,
    class: className,
    classNames,
    icons,
    renderToast,
  }: AnimatedToastStackProps = $props();

  let mounted = $state(false);
  const visibleToasts = $derived(toasts.slice(-maxVisible));
  const isBottom = $derived(position.startsWith("bottom"));
  const resolvedPlacement = $derived(placement ?? (fixed ? "fixed" : "static"));
  const shouldPortal = $derived(portalProp ?? resolvedPlacement === "fixed");

  $effect(() => {
    mounted = true;
  });
</script>

<!-- Portal only matters for fixed/absolute placement so the stack escapes
     transformed ancestors; static placement renders inline. -->
{#if shouldPortal}
  {#if mounted}
    <div use:portal={portalTarget ?? undefined}>
      <ol
        aria-live="polite"
        aria-atomic="false"
        class={cn(
          "pointer-events-none flex w-[calc(100vw-2rem)] max-w-sm gap-2",
          isBottom ? "flex-col-reverse" : "flex-col",
          resolvedPlacement === "fixed" && "fixed z-[90]",
          resolvedPlacement === "absolute" && "absolute z-20",
          resolvedPlacement !== "static" && POSITION_CLASS[position],
          classNames?.root,
          className,
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {#each visibleToasts as toast, index (toast.id)}
            <ToastItem {toast} {index} {onDismiss} {classNames} {icons} {renderToast} />
          {/each}
        </AnimatePresence>
      </ol>
    </div>
  {/if}
{:else}
  <ol
    aria-live="polite"
    aria-atomic="false"
    class={cn(
      "pointer-events-none flex w-[calc(100vw-2rem)] max-w-sm gap-2",
      isBottom ? "flex-col-reverse" : "flex-col",
      classNames?.root,
      className,
    )}
  >
    <AnimatePresence initial={false} mode="popLayout">
      {#each visibleToasts as toast, index (toast.id)}
        <ToastItem {toast} {index} {onDismiss} {classNames} {icons} {renderToast} />
      {/each}
    </AnimatePresence>
  </ol>
{/if}
