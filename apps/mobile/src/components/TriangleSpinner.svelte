<script lang="ts">
  // Triangle dot-matrix spinner for subagents — mirrors the desktop's
  // SubagentCard BrailleSpinner (shape="triangle"). Renders the "Core Spokes"
  // loader directly. Dots use currentColor so they inherit the theme accent.
  import Triangle1 from "../lib/dot-matrix/components/loaders/triangle/triangle-1.svelte";
  import type { DotMatrixCommonProps } from "../lib/dot-matrix/components/dot-matrix/types.js";

  let {
    class: klass = "",
    size = 11,
    dotSize = 1.5,
  }: { class?: string; size?: number; dotSize?: number } & Partial<DotMatrixCommonProps> = $props();
</script>

<Triangle1
  class={klass}
  {size}
  {dotSize}
  bloom
  animated
  aria-hidden="true"
/>
