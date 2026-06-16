<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";

  let { text }: { text: string } = $props();

  const html = $derived(
    DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string),
  );
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized above -->
<div class="md">{@html html}</div>

<style>
  .md :global(p) {
    margin: 0 0 0.65em;
  }
  .md :global(p:last-child) {
    margin-bottom: 0;
  }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4) {
    margin: 1em 0 0.4em;
    font-weight: 600;
    color: var(--color-fg);
    line-height: 1.3;
  }
  .md :global(h1) {
    font-size: 1.25em;
  }
  .md :global(h2) {
    font-size: 1.1em;
  }
  .md :global(h3),
  .md :global(h4) {
    font-size: 1em;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 0.65em;
    padding-left: 1.4em;
  }
  .md :global(ul) {
    list-style: disc;
  }
  .md :global(ol) {
    list-style: decimal;
  }
  .md :global(li) {
    margin: 0.15em 0;
  }
  .md :global(li::marker) {
    color: var(--color-faint);
  }
  .md :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    background: var(--color-surface-2);
    border-radius: 4px;
    padding: 0.1em 0.35em;
    color: var(--color-fg);
  }
  .md :global(pre) {
    margin: 0.65em 0;
    padding: 0.75em 1em;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow-x: auto;
  }
  .md :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--color-fg-soft);
  }
  .md :global(blockquote) {
    margin: 0.65em 0;
    padding: 0.1em 0 0.1em 0.9em;
    border-left: 3px solid var(--color-border-strong);
    color: var(--color-muted);
  }
  .md :global(a) {
    color: var(--color-accent);
    text-decoration: none;
  }
  .md :global(a:hover) {
    text-decoration: underline;
  }
  .md :global(table) {
    margin: 0.65em 0;
    border-collapse: collapse;
    font-size: 0.85em;
  }
  .md :global(th),
  .md :global(td) {
    border: 1px solid var(--color-border);
    padding: 0.3em 0.7em;
    text-align: left;
  }
  .md :global(th) {
    background: var(--color-surface);
    font-weight: 600;
  }
  .md :global(hr) {
    margin: 1em 0;
    border: none;
    border-top: 1px solid var(--color-border);
  }
  .md :global(strong) {
    color: var(--color-fg);
    font-weight: 600;
  }
</style>
