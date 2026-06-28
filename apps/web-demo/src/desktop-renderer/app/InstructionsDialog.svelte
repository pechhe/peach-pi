<script lang="ts">
  // Animated markdown dialog. Mirrors the CompactionDialog motion pattern
  // (portal + motion.div + SPRING_PANEL). Used both for agent instructions and
  // as the host for the global text/attachment viewer.
  import { motion, useReducedMotion } from "motion-sv";
  import { portal } from "../lib/beui/portal";
  import { EASE_OUT } from "../lib/beui/ease";
  import { PANEL_SPRING } from "../lib/beui/command-palette.svelte";
  import { cn } from "../lib/utils";
  import Markdown from "./Markdown.svelte";

  let {
    open = $bindable<boolean>(false),
    title = "",
    subtitle,
    content = "",
    testId = "markdown-dialog-overlay",
  }: {
    open?: boolean;
    title?: string;
    subtitle?: string;
    content?: string;
    testId?: string;
  } = $props();

  const reduce = useReducedMotion();

  function close() {
    open = false;
  }

  // A pasted HTML document is not markdown — rendering it would execute a
  // blank live page. Show it as readable source in a code block instead.
  const looksLikeHtml = $derived(/^\s*<(?:!doctype html|html[\s>]|\?xml)/i.test(content));

  // Copying markdown often flattens a fenced block (```lang / body / ```)
  // onto a single line, which then renders as literal backticks. Re-expand.
  function fixInlineFences(md: string): string {
    return md.replace(
      /^([ \t]*)```(\w*)[ \t]+(.+?)[ \t]*```[ \t]*$/gm,
      (_m, indent, lang, body) => `${indent}\`\`\`${lang}\n${body}\n${indent}\`\`\``,
    );
  }

  const rendered = $derived(
    looksLikeHtml ? "```html\n" + content + "\n```" : fixInlineFences(content),
  );

  // Listen for Escape at the window level so it works even before the dialog
  // receives focus. Active only while the dialog is open.
  $effect(() => {
    if (!open) return;
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

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    aria-hidden={!open}
    data-testid={testId}
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
        aria-label={title}
        tabindex={-1}
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open || reduce.current ? 0 : -8,
          scale: open || reduce.current ? 1 : 0.97,
        }}
        transition={reduce.current ? { duration: 0.1 } : open ? PANEL_SPRING : { duration: 0.12, ease: EASE_OUT }}
        class={cn(
          "pointer-events-auto flex h-[80vh] w-[min(820px,92vw)] flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl will-change-transform",
        )}
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-sm font-semibold text-fg">{title}</h2>
            {#if subtitle}
              <p class="mt-1 truncate text-xs text-faint">{subtitle}</p>
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

        <div class="tv-md min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {#if content}
            <Markdown text={rendered} />
          {:else}
            <p class="text-sm text-faint">No content available.</p>
          {/if}
        </div>
      </motion.div>
    </div>
  </div>
{/if}

<style>
  /* Reading-optimised overrides, scoped to this dialog only (chat keeps scroll). */
  .tv-md :global(.md) {
    max-width: 70ch;
    margin-inline: auto;
    font-size: 0.95rem;
    line-height: 1.65;
  }
  .tv-md :global(.md pre) {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
