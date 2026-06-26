<script lang="ts">
  // Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
  // Adapted: token classes remapped to peach-pi's @theme tokens
  // (bg-surface / text-fg / border-border-strong / text-muted / accent /
  // success / danger).
  import { AnimatePresence, motion, useReducedMotion } from "motion-sv";
  import { EASE_OUT } from "./ease";
  import { cn } from "../utils";
  import type { Snippet } from "svelte";
  import type {
    AnimatedToast,
    ToastClassNames,
    ToastStatus,
  } from "./use-animated-toast-stack.svelte";
  import { STATUS_CLASS, STATUS_ICON, X } from "./toast-status.svelte";

  interface ToastItemProps {
    toast: AnimatedToast;
    index: number;
    onDismiss?: (id: string) => void;
    classNames?: ToastClassNames;
    icons?: Partial<Record<ToastStatus, Snippet>>;
    renderToast?: (toast: AnimatedToast) => Snippet;
  }

  let { toast, index, onDismiss, classNames, icons, renderToast }: ToastItemProps = $props();

  const reduce = useReducedMotion();
  const status = $derived(toast.status ?? "neutral");
  const Icon = $derived(STATUS_ICON[status]);
  const canDismiss = $derived(toast.dismissible !== false && Boolean(onDismiss));
  const customSnip = $derived(icons?.[status]);
  const showStatusIcon = $derived(customSnip === undefined);

  const STACK_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.75 } as const;
  const CONTENT_TRANSITION = { duration: 0.28, ease: EASE_OUT };
</script>

<motion.li
  layout
  initial={reduce.current ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96, filter: "blur(10px)" }}
  animate={reduce.current ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
  exit={
    reduce.current
      ? { opacity: 0 }
      : {
          opacity: 0,
          x: 32,
          scale: 0.96,
          filter: "blur(8px)",
          transition: { duration: 0.18, ease: EASE_OUT },
        }
  }
  transition={STACK_SPRING}
  drag={canDismiss && !reduce.current ? "x" : false}
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={0.18}
  onDragEnd={(_, info) => {
    if (!canDismiss || !onDismiss) return;
    if (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 520) {
      onDismiss(toast.id);
    }
  }}
  class={cn("pointer-events-auto relative will-change-transform", classNames?.item)}
  style={{ zIndex: 20 - index }}
>
  <div class={cn("relative overflow-hidden rounded-2xl border border-border-strong bg-surface/95 p-3 shadow-2xl backdrop-blur-xl", classNames?.surface)}>
    {#if renderToast}
      {@const rendered = renderToast(toast)}
      {@render rendered()}
    {:else}
      <div class="flex items-start gap-3">
        <motion.span
          layout
          class={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            STATUS_CLASS[status],
            classNames?.iconWrap,
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {#key status}
              <motion.span
                initial={reduce.current ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.8, filter: "blur(6px)" }}
                animate={reduce.current ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={reduce.current ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.9, filter: "blur(6px)" }}
                transition={CONTENT_TRANSITION}
                class="inline-flex"
              >
                {#if customSnip}
                  {@render customSnip()}
                {:else if toast.icon}
                  {@render toast.icon()}
                {:else if status === "loading"}
                  <span class="inline-flex animate-spin"><Icon class="h-3.5 w-3.5" /></span>
                {:else if showStatusIcon}
                  <Icon class="h-3.5 w-3.5" />
                {/if}
              </motion.span>
            {/key}
          </AnimatePresence>
        </motion.span>

        <div class={cn("min-w-0 flex-1", classNames?.content)}>
          <AnimatePresence mode="popLayout" initial={false}>
            {#key `${toast.id}-${status}-${toast.title}`}
              <motion.div
                initial={reduce.current ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(6px)" }}
                animate={reduce.current ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce.current ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
                transition={CONTENT_TRANSITION}
              >
                <p class={cn("line-clamp-2 text-sm font-medium leading-5 text-fg", classNames?.title)}>
                  {@render toast.title()}
                </p>
                {#if toast.description}
                  <p class={cn("mt-0.5 line-clamp-2 text-xs leading-4 text-muted", classNames?.description)}>
                    {@render toast.description()}
                  </p>
                {/if}
              </motion.div>
            {/key}
          </AnimatePresence>

          {#if toast.action}
            <button
              type="button"
              onclick={() => toast.action?.onClick(toast)}
              class={cn(
                "mt-2 inline-flex h-7 items-center rounded-full bg-fg/[0.06] px-3 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.1]",
                classNames?.action,
              )}
            >
              {@render toast.action.label()}
            </button>
          {/if}
        </div>

        {#if canDismiss}
          <button
            type="button"
            onclick={() => onDismiss?.(toast.id)}
            aria-label="Dismiss toast"
            class={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg",
              classNames?.close,
            )}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        {/if}
      </div>
    {/if}
  </div>
</motion.li>
