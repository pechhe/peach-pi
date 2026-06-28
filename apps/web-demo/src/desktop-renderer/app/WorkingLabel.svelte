<script lang="ts">
  // Animated "Thinking…" indicator ported from peche-pi: braille spinner +
  // shimmer sweep across the label text.
  import BrailleSpinner from "./BrailleSpinner.svelte";

  let { label }: { label: string } = $props();
</script>

<span class="working-label">
  <BrailleSpinner class="working-label__spinner" />
  <span class="working-label__text">{label}</span>
</span>
