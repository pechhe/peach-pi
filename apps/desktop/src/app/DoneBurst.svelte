<script lang="ts">
  import { onMount } from "svelte";
  import { doneAnim, type DoneAnimId } from "../lib/done-anim.svelte";
  import "../styles/done-anim-burst.css";

  let { ondone }: { ondone: () => void } = $props();

  const reduce =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const DURATIONS: Record<DoneAnimId, number> = {
    popSpark: 560,
    stamp: 520,
    confetti: 720,
    twos: 560,
    spring: 600,
  };

  const N = 16;
  const colors = ["var(--color-accent)", "#ffffff", "#fbbf24", "#f472b6", "#34d399"];

  let variant = $derived(doneAnim.current);
  let duration = $derived(reduce ? 0 : DURATIONS[variant]);

  // Generate particles. Confetti needs gravity-arc props (cf, spin) and
  // prefers square chips; every other variant uses radial spread (dx, dy).
  let particles = $derived.by(() => {
    const isConfetti = variant === "confetti";
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + (i % 2) * 0.2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        dx: cos * 32,
        dy: sin * 32,
        cf: cos * 26,
        spin: (i % 2 ? 1 : -1) * (360 + i * 28),
        color: colors[i % colors.length],
        size: isConfetti ? 4 + (i % 2) : 3 + (i % 3),
        square: isConfetti ? i % 2 === 0 : false,
      };
    });
  });

  onMount(() => {
    const t = setTimeout(ondone, duration);
    return () => clearTimeout(t);
  });
</script>

<div class="burst burst--{variant}" style="--dur:{duration}ms">
  <span class="ring"></span>
  <span class="ring ring2"></span>
  {#each particles as p, i (i)}
    <span
      class="spark"
      class:square={p.square}
      style="--dx:{p.dx}px; --dy:{p.dy}px; --cf:{p.cf}px; --spin:{p.spin}deg; width:{p.size}px; height:{p.size}px; background:{p.color};"
    ></span>
  {/each}
</div>
