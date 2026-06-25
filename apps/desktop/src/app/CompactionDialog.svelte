<script lang="ts" module>
  import type { TranscriptItem } from "@peach-pi/shared-types";
  export type CompactionItem = Extract<TranscriptItem, { kind: "compaction" }>;
</script>

<script lang="ts">
  // Animated compaction summary dialog. Reuses the beui motion-sv pattern
  // (portal + motion.div + SPRING_PANEL) also used by the command palette.
  import { motion, useReducedMotion } from "motion-sv";
  import { portal } from "../lib/beui/portal";
  import { EASE_OUT } from "../lib/beui/ease";
  import { PANEL_SPRING } from "../lib/beui/command-palette.svelte";
  import { cn } from "../lib/utils";
  import { clickCopy } from "../lib/code-copy";
  import Markdown from "./Markdown.svelte";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";

  let {
    item = $bindable<CompactionItem | null>(null),
    threadId,
    onRetry,
  }: {
    item?: CompactionItem | null;
    threadId: string;
    onRetry?: () => void;
  } = $props();

  const open = $derived(!!item);
  const reduce = useReducedMotion();

  function close() {
    item = null;
  }

  // Listen for Escape at the window level so it works even before the dialog
  // receives focus. Active only while the dialog is open.
  $effect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
</script>

{#if item}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    aria-hidden={!open}
    data-testid="compaction-dialog-overlay"
    class={cn("fixed inset-0 z-[100]", open ? "pointer-events-auto" : "pointer-events-none")}
  >
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: open ? 0.18 : 0.12, ease: EASE_OUT }}
      onclick={close}
      class={cn(
        "absolute inset-0 bg-bg/40 [backdrop-filter:blur(12px)_saturate(140%)] [-webkit-backdrop-filter:blur(12px)_saturate(140%)]",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    ></motion.div>

    <div
      class="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
      style="padding-left: var(--content-left, 0px)"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Compaction summary"
        tabindex={-1}
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open || reduce.current ? 0 : -8,
          scale: open || reduce.current ? 1 : 0.97,
        }}
        transition={reduce.current ? { duration: 0.1 } : open ? PANEL_SPRING : { duration: 0.12, ease: EASE_OUT }}
        class={cn(
          "pointer-events-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl will-change-transform",
        )}
      >
        <div class="flex items-start gap-3 border-b border-border px-5 py-4">
          <span class="mt-0.5 shrink-0 text-faint text-lg leading-none">⌘</span>
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-semibold text-fg">
              {item.aborted
                ? "Compaction aborted"
                : item.error
                  ? "Compaction failed"
                  : item.reason === "manual"
                    ? "Context compacted"
                    : "Context compacted automatically"}
            </h2>
            {#if item.tokensBefore && item.tokensAfter}
              <p class="mt-1 text-xs text-faint">
                {item.tokensBefore} → {item.tokensAfter} tokens
              </p>
            {:else if item.tokensBefore}
              <p class="mt-1 text-xs text-faint">{item.tokensBefore} tokens summarised</p>
            {/if}
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
            onclick={close}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="px-5 py-4">
          {#if item.error}
            <div class="rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-2 text-xs text-danger">
              <p use:clickCopy={item.error}>{item.error}</p>
            </div>
          {:else if item.summary}
            <div class="max-h-[80vh] overflow-y-auto text-xs leading-relaxed text-fg-soft">
              <Markdown text={item.summary} />
            </div>
          {:else}
            <p class="text-sm text-faint">No summary available.</p>
          {/if}

          {#if item.error && onRetry}
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border-strong/40 bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              onclick={onRetry}
            >
              <RotateCw size={12} />
              <span>Retry compaction</span>
            </button>
          {/if}
        </div>
      </motion.div>
    </div>
  </div>
{/if}
