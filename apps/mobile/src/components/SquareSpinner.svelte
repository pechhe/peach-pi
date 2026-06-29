<script lang="ts">
  // Square dot-matrix spinner for the chat surface — mirrors the desktop's
  // WorkingLabel BrailleSpinner (shape="square"). Renders the "Neon Drift"
  // loader directly. Dots use currentColor so they inherit the theme accent.
  import Square1 from "../lib/dot-matrix/components/loaders/square/square-1.svelte";
  import type { DotMatrixCommonProps } from "../lib/dot-matrix/components/dot-matrix/types.js";

  let {
    class: klass = "",
    size = 13,
    dotSize = 2,
  }: { class?: string; size?: number; dotSize?: number } & Partial<DotMatrixCommonProps> = $props();
</script>

<Square1
  class={klass}
  {size}
  {dotSize}
  bloom
  animated
  aria-hidden="true"
/>
