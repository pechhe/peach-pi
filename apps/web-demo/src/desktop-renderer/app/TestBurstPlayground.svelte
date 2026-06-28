<script lang="ts">
  import Eye from "@lucide/svelte/icons/eye";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import { testAnim, type TestAnimId } from "../lib/test-anim.svelte";
  import { playTestSound } from "../lib/sound/test-sound";

  type Variant = { id: TestAnimId; label: string; desc: string };
  const VARIANTS: Variant[] = [
    {
      id: "testBench",
      label: "Test bench stamp",
      desc: "Press · amber scan sweep · TEST badge stamp · settle into testing state (no particles)",
    },
  ];

  let runs = $state<Record<string, number>>({});
  let popping = $state<Record<string, boolean>>({});

  function play(id: string) {
    runs[id] = (runs[id] ?? 0) + 1;
    popping[id] = false;
    void playTestSound(id as TestAnimId);
    requestAnimationFrame(() => {
      popping[id] = true;
      setTimeout(() => (popping[id] = false), 500);
    });
  }
</script>

<div class="flex flex-col gap-3">
  {#each VARIANTS as v (v.id)}
    {@const isActive = testAnim.current === v.id}
    <div class="flex items-center justify-between gap-3">
      <!-- left: radio + label -->
      <label class="flex min-w-0 cursor-pointer items-center gap-2">
        <input
          type="radio"
          name="test-anim"
          checked={isActive}
          onchange={() => testAnim.set(v.id)}
          class="accent-[var(--color-accent)]"
        />
        <div>
          <p class="text-xs text-fg">{v.label}</p>
          <p class="text-[11px] text-faint">{v.desc}</p>
        </div>
      </label>

      <!-- right: preview + play -->
      <div class="relative flex shrink-0 items-center">
        <div
          class="mock-row"
          class:popping={popping[v.id]}
          class:pop--testBench={popping[v.id] && v.id === "testBench"}
        >
          <FlaskConical size={13} class="shrink-0 text-amber-500" />
          <span class="truncate">Mock thread</span>
        </div>

        {#key runs[v.id]}
          {#if runs[v.id]}
            <div class="burst burst--{v.id}"></div>
          {/if}
        {/key}

        <button
          class="ml-3 rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:border-border-focus"
          onclick={() => play(v.id)}
        >
          Play
        </button>
      </div>
    </div>
  {/each}
</div>

<style>
  .mock-row {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 150px;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-selected);
    transform-origin: center;
  }

  /* testBench — press tighten → amber scan sweep → stamp flash → settle.
     ::after = the thin calibration scan line.
     ::before = the stamp veil that flashes when the badge imprints. */
  .popping.pop--testBench {
    position: relative;
    overflow: hidden;
    transform-origin: center top;
    animation: test-bench-row 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .popping.pop--testBench::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    /* thin amber/blue calibration line — narrow, bright, screen-blended */
    background: linear-gradient(
      100deg,
      transparent 44%,
      oklch(0.82 0.16 75 / 0.6) 48%,
      oklch(0.92 0.18 200 / 0.95) 50%,
      oklch(0.82 0.16 75 / 0.6) 52%,
      transparent 56%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: test-bench-scan 180ms cubic-bezier(0.4, 0, 0.2, 1) 60ms forwards;
  }
  .popping.pop--testBench::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    /* stamp imprint veil — a brief amber inset flash + ring reading as an
       inspection label being applied */
    box-shadow:
      inset 0 0 0 1.5px oklch(0.82 0.16 75 / 0.9),
      inset 0 0 14px 2px oklch(0.82 0.16 75 / 0.35);
    background: oklch(0.82 0.16 75 / 0.08);
    opacity: 0;
    animation: test-bench-stamp 140ms cubic-bezier(0.16, 1, 0.3, 1) 160ms forwards;
  }

  .burst { inset: 0 calc(0.75rem + 52px) 0 0; }

  @media (prefers-reduced-motion: reduce) {
    .mock-row { animation: none !important; }
  }
</style>
