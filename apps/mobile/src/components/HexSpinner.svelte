<script lang="ts">
  // Hex dot-matrix spinner for a running thread. Vendors the desktop app's
  // dot-matrix subsystem (the sidebar's BrailleSpinner shape="hex") and renders
  // the "Hex Orbit" loader directly — no registry, no per-user curation, no
  // settings UI (the phone has none). Dots use currentColor so they inherit the
  // theme accent from their surrounding context, exactly like the desktop.
  import Hex1 from "../lib/dot-matrix/components/loaders/hex/hex-1.svelte";
  import type { DotMatrixCommonProps } from "../lib/dot-matrix/components/dot-matrix/types.js";

  let {
    class: klass = "",
    size = 15,
    dotSize = 2,
  }: { class?: string; size?: number; dotSize?: number } & Partial<DotMatrixCommonProps> = $props();
</script>

<Hex1
  class={klass}
  {size}
  {dotSize}
  bloom
  animated
  aria-hidden="true"
/>
