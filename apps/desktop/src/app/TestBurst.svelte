<script lang="ts">
  import { onMount } from "svelte";
  import { testAnim, type TestAnimId } from "../lib/test-anim.svelte";
  import "../styles/test-anim-burst.css";

  let { ondone }: { ondone: () => void } = $props();

  const reduce =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const DURATIONS: Record<TestAnimId, number> = {
    testBench: 280,
  };

  let variant = $derived(testAnim.current);
  let duration = $derived(reduce ? 0 : DURATIONS[variant]);
  // The testBench effect is carried entirely on the row itself (scan sweep +
  // stamp flash); the burst overlay renders no ring/sparks.
  let bare = $derived(true);

  onMount(() => {
    const t = setTimeout(ondone, duration);
    return () => clearTimeout(t);
  });
</script>

<div class="burst burst--{variant}" style="--dur:{duration}ms">
  {#if !bare}
    <!-- no overlay particles for testBench -->
  {/if}
</div>
