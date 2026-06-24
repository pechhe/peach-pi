<script lang="ts">
  import { textViewer } from "../stores/text-viewer.svelte";
  import Markdown from "./Markdown.svelte";
  import X from "@lucide/svelte/icons/x";

  // A pasted HTML document is not markdown — rendering it would execute a blank
  // live page. Show it as readable source in a code block instead.
  const looksLikeHtml = $derived(/^\s*<(?:!doctype html|html[\s>]|\?xml)/i.test(textViewer.content));

  // Copying markdown often flattens a fenced block (```lang / body / ```) onto a
  // single line, which then renders as literal backticks. Re-expand those.
  function fixInlineFences(md: string): string {
    return md.replace(
      /^([ \t]*)```(\w*)[ \t]+(.+?)[ \t]*```[ \t]*$/gm,
      (_m, indent, lang, body) => `${indent}\`\`\`${lang}\n${body}\n${indent}\`\`\``,
    );
  }

  const rendered = $derived(
    looksLikeHtml ? "```html\n" + textViewer.content + "\n```" : fixInlineFences(textViewer.content),
  );

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && textViewer.name !== null) {
      e.preventDefault();
      textViewer.close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if textViewer.name !== null}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
    style="padding-left: var(--content-left, 0px)"
    role="button"
    tabindex="0"
    aria-label="Close text viewer"
    onclick={() => textViewer.close()}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && textViewer.close()}
    data-testid="text-attachment-viewer"
  >
    <!-- Stop propagation so clicks inside the panel don't close it. -->
    <div
      class="flex h-[80vh] w-[min(820px,92vw)] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border-strong px-4 py-2.5">
        <span class="truncate text-sm font-medium text-fg">{textViewer.name}</span>
        <button
          class="flex size-6 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
          onclick={() => textViewer.close()}><X size={14} /></button
        >
      </div>
      <div class="tv-md min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Markdown text={rendered} />
      </div>
    </div>
  </div>
{/if}

<style>
  /* Reading-optimised overrides, scoped to this viewer only (chat keeps scroll). */
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
