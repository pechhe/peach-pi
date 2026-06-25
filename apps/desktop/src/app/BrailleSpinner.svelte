<script lang="ts">
  // Dot-matrix loader (sv-matrix port). Replaces the old braille glyph spinner.
  // Takes a grid `shape` so different surfaces use different geometries:
  // square = chat surface, hex = sidebar, triangle = agents. Picks a random one
  // from the user's curated selection each mount, with the glow (bloom) effect
  // enabled. Dots are tinted with currentColor, so they inherit the theme accent
  // from .working-label__spinner / .session-spinner. Keeps the original
  // `class` / `title` prop surface so existing call sites are unchanged.
  import DotMatrixLoader from "../components/ui/dot-matrix/DotMatrixLoader.svelte";
  import type { LoaderShape } from "../components/ui/dot-matrix/registry.svelte";

  let {
    class: klass = "",
    title,
    shape = "square",
    size = 18,
    dotSize = 3,
  }: {
    class?: string;
    title?: string;
    shape?: LoaderShape;
    size?: number;
    dotSize?: number;
  } = $props();
</script>

<DotMatrixLoader
  class={klass}
  {shape}
  {size}
  {dotSize}
  aria-label={title ?? "Loading"}
  aria-hidden={title ? undefined : true}
  animated
/>
