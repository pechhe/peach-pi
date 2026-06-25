<script lang="ts">
  // Random dot-matrix loader picker. Takes a grid `shape` (square = chat
  // surface, hex = sidebar, triangle = agents), reads the user's curated
  // selection from loaderPrefs, picks one at random per mount, and renders it.
  // Glow (bloom) is on by default; dots use currentColor so they inherit the
  // theme accent from the surrounding context.
  import { byId } from "./registry.svelte";
  import type { LoaderShape } from "./registry.svelte";
  import { loaderPrefs } from "../../../lib/loader-prefs.svelte";
  import type { DotMatrixCommonProps } from "../../../lib/components/dot-matrix/types.js";

  let {
    shape = "square",
    size = 18,
    dotSize = 3,
    bloom = true,
    ...rest
  }: DotMatrixCommonProps & { shape?: LoaderShape } = $props();

  // Pick once per mount from the user's selection for this shape.
  const pool = loaderPrefs.selection(shape);
  const chosenId = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : undefined;
  const entry = chosenId ? byId(chosenId) : undefined;
  const Loader = entry?.component;
</script>

{#if Loader}
  <Loader {size} {dotSize} {bloom} animated {...rest} />
{/if}
