<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import { doneAnim, type DoneAnimId } from "../lib/done-anim.svelte";
  import "../styles/done-anim-burst.css";

  type Variant = { id: DoneAnimId; label: string; desc: string };
  const VARIANTS: Variant[] = [
    { id: "popSpark", label: "Pop & sparkle", desc: "Stepped pop · smooth radial sparks" },
    { id: "stamp", label: "Approval stamp", desc: "Hard stepped stamp · smooth shockwave rings" },
    { id: "confetti", label: "Confetti", desc: "Bouncy smooth pop · arcing confetti with gravity" },
    { id: "twos", label: "Full on-twos", desc: "Everything stepped (high step count, textured)" },
    { id: "spring", label: "Springy ring", desc: "Smooth spring pop · double ring pulse · fine dots" },
  ];

  const N = 16;
  const baseColors = ["var(--color-accent)", "#ffffff", "#fbbf24", "#f472b6", "#34d399"];

  function makeParticles(vid: DoneAnimId) {
    const isConfetti = vid === "confetti";
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + (i % 2) * 0.2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        dx: cos * 32,
        dy: sin * 32,
        cf: cos * 26,
        spin: (i % 2 ? 1 : -1) * (360 + i * 28),
        color: baseColors[i % baseColors.length],
        size: isConfetti ? 4 + (i % 2) : 3 + (i % 3),
        square: isConfetti ? i % 2 === 0 : false,
      };
    });
  }

  const particlesByVariant = Object.fromEntries(
    VARIANTS.map((v) => [v.id, makeParticles(v.id)]),
  ) as Record<DoneAnimId, ReturnType<typeof makeParticles>>;

  let runs = $state<Record<string, number>>({});
  let popping = $state<Record<string, boolean>>({});

  function play(id: string) {
    runs[id] = (runs[id] ?? 0) + 1;
    popping[id] = false;
    requestAnimationFrame(() => {
      popping[id] = true;
      setTimeout(() => (popping[id] = false), 700);
    });
  }
</script>

<div class="flex flex-col gap-3">
  {#each VARIANTS as v (v.id)}
    {@const isActive = doneAnim.current === v.id}
    {@const particles = particlesByVariant[v.id]}
    <div class="flex items-center justify-between gap-3">
      <!-- left: radio + label -->
      <label class="flex min-w-0 cursor-pointer items-center gap-2">
        <input
          type="radio"
          name="done-anim"
          checked={isActive}
          onchange={() => doneAnim.set(v.id)}
          class="accent-[var(--color-accent)]"
        />
        <div>
          <p class="text-xs text-fg">{v.label}</p>
          <p class="text-[11px] text-faint">{v.desc}</p>
        </div>
      </label>

      <!-- right: preview + play -->
      <div class="relative flex shrink-0 items-center">
        <div class="mock-row" class:popping={popping[v.id]} class:pop--popSpark={popping[v.id] && v.id === "popSpark"} class:pop--stamp={popping[v.id] && v.id === "stamp"} class:pop--confetti={popping[v.id] && v.id === "confetti"} class:pop--twos={popping[v.id] && v.id === "twos"} class:pop--spring={popping[v.id] && v.id === "spring"}>
          <Check size={13} class="shrink-0 text-accent" />
          <span class="truncate">Mock thread</span>
        </div>

        {#key runs[v.id]}
          {#if runs[v.id]}
            <div class="burst burst--{v.id}">
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

  .burst { inset: 0 calc(0.75rem + 52px) 0 0; }

  /* ── per-variant card pop (same keyframes as Sidebar) ────────── */
  .popping.pop--popSpark { animation: pop-spark 420ms steps(1, jump-end); }
  @keyframes pop-spark {
    0%   { transform: scale(1)    rotate(0);     }
    15%  { transform: scale(0.92) rotate(0);     }
    35%  { transform: scale(1.08) rotate(-2deg); }
    55%  { transform: scale(0.97) rotate(1.5deg);}
    75%  { transform: scale(1.03) rotate(-0.5deg);}
    100% { transform: scale(1)    rotate(0);     }
  }
  .popping.pop--stamp { animation: pop-stamp 380ms steps(1, jump-end); }
  @keyframes pop-stamp {
    0%   { transform: scale(1.3) rotate(-4deg); }
    35%  { transform: scale(0.9) rotate(1deg);   }
    60%  { transform: scale(1.06) rotate(-1deg); }
    100% { transform: scale(1)    rotate(0);     }
  }
  .popping.pop--confetti { animation: pop-confetti 460ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes pop-confetti {
    0%   { transform: scale(1);    }
    40%  { transform: scale(1.12); }
    70%  { transform: scale(0.97); }
    100% { transform: scale(1);    }
  }
  .popping.pop--twos { animation: pop-spark 420ms steps(1, jump-end); }
  .popping.pop--spring { animation: pop-spring 620ms cubic-bezier(0.5, 1.4, 0.5, 1); }
  @keyframes pop-spring {
    0%   { transform: scale(1);    }
    25%  { transform: scale(1.1);  }
    45%  { transform: scale(0.96); }
    65%  { transform: scale(1.04); }
    82%  { transform: scale(0.99); }
    100% { transform: scale(1);    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mock-row { animation: none !important; }
  }
</style>
