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
