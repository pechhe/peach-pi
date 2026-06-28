<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import { doneAnim, type DoneAnimId } from "../lib/done-anim.svelte";
  import "../styles/done-anim-burst.css";

  type Variant = { id: DoneAnimId; label: string; desc: string };
  const VARIANTS: Variant[] = [
    {
      id: "archiveSlide",
      label: "Precision archive slide",
      desc: "Press · metallic glint sweep · slide, fade & collapse (no particles)",
    },
    {
      id: "archiveSwipe",
      label: "Archive swipe",
      desc: "Snappier · longer throw with a slight tilt · brighter glint",
    },
    {
      id: "archiveShing",
      label: "Archive shing",
      desc: "Twin crossing glints · chrome brightness ping · crisp collapse",
    },
    {
      id: "archiveVacuum",
      label: "Archive vacuum",
      desc: "Extreme · squash, skew & motion-blur sucked toward Done",
    },
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
        <div class="mock-row" class:popping={popping[v.id]} class:pop--archiveSlide={popping[v.id] && v.id === "archiveSlide"} class:pop--archiveSwipe={popping[v.id] && v.id === "archiveSwipe"} class:pop--archiveShing={popping[v.id] && v.id === "archiveShing"} class:pop--archiveVacuum={popping[v.id] && v.id === "archiveVacuum"} class:pop--popSpark={popping[v.id] && v.id === "popSpark"} class:pop--stamp={popping[v.id] && v.id === "stamp"} class:pop--confetti={popping[v.id] && v.id === "confetti"} class:pop--twos={popping[v.id] && v.id === "twos"} class:pop--spring={popping[v.id] && v.id === "spring"}>
          <Check size={13} class="shrink-0 text-accent" />
          <span class="truncate">Mock thread</span>
        </div>

        {#key runs[v.id]}
          {#if runs[v.id]}
            <div class="burst burst--{v.id}">
              {#if !v.id.startsWith("archive")}
              <span class="ring"></span>
              <span class="ring ring2"></span>
              {#each particles as p, i (i)}
                <span
                  class="spark"
                  class:square={p.square}
                  style="--dx:{p.dx}px; --dy:{p.dy}px; --cf:{p.cf}px; --spin:{p.spin}deg; width:{p.size}px; height:{p.size}px; background:{p.color};"
                ></span>
              {/each}
              {/if}
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

  /* v0 Precision archive slide — preview keeps height (resets on replay);
     the signature is the metallic glint sweep + slide/fade. */
  .popping.pop--archiveSlide { animation: pop-archive 480ms cubic-bezier(0.22, 1, 0.36, 1); }
  .popping.pop--archiveSlide::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 38%,
      oklch(1 0 0 / 0.55) 47%,
      oklch(1 0 0 / 0.95) 50%,
      oklch(1 0 0 / 0.55) 53%,
      transparent 62%
    );
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: pop-archive-glint 230ms cubic-bezier(0.4, 0, 0.2, 1) 70ms;
  }
  @keyframes pop-archive {
    0%   { transform: translateY(0) scale(1);     }
    16%  { transform: translateY(0) scale(0.985); }
    24%  { transform: translateY(0) scale(0.992); }
    62%  { transform: translateY(8px) scale(0.99);  opacity: 0.28; }
    80%  { transform: translateY(10px) scale(0.985); opacity: 0.06; }
    100% { transform: translateY(10px) scale(0.985); opacity: 0; }
  }
  @keyframes pop-archive-glint {
    0%   { transform: translateX(-130%); opacity: 0; }
    25%  { opacity: 1; }
    100% { transform: translateX(130%);  opacity: 0; }
  }
  @keyframes pop-archive-glint-rev {
    0%   { transform: translateX(130%);  opacity: 0; }
    25%  { opacity: 1; }
    100% { transform: translateX(-130%); opacity: 0; }
  }

  /* swipe */
  .popping.pop--archiveSwipe { animation: pop-swipe 420ms cubic-bezier(0.3, 0, 0.2, 1); }
  .popping.pop--archiveSwipe::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(100deg, transparent 36%, oklch(1 0 0 / 0.7) 48%, oklch(1 0 0 / 1) 50%, oklch(1 0 0 / 0.7) 52%, transparent 64%);
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: pop-archive-glint 180ms cubic-bezier(0.4, 0, 0.2, 1) 50ms;
  }
  @keyframes pop-swipe {
    0%   { transform: translate(0, 0) rotate(0) scale(1);     }
    14%  { transform: translate(0, 0) rotate(0) scale(0.978); }
    22%  { transform: translate(-2px, 0) rotate(-0.4deg) scale(0.99); }
    58%  { transform: translate(20px, 9px) rotate(1deg) scale(0.97); opacity: 0.22; }
    80%  { transform: translate(26px, 12px) rotate(1.4deg) scale(0.96); opacity: 0.04; }
    100% { transform: translate(26px, 12px) rotate(1.4deg) scale(0.96); opacity: 0; }
  }

  /* shing */
  .popping.pop--archiveShing { animation: pop-shing 460ms cubic-bezier(0.22, 1, 0.36, 1); }
  .popping.pop--archiveShing::after,
  .popping.pop--archiveShing::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  .popping.pop--archiveShing::after {
    background: linear-gradient(100deg, transparent 38%, oklch(1 0 0 / 0.85) 50%, transparent 62%);
    transform: translateX(-130%);
    animation: pop-archive-glint 200ms cubic-bezier(0.4, 0, 0.2, 1) 40ms;
  }
  .popping.pop--archiveShing::before {
    background: linear-gradient(260deg, transparent 38%, oklch(1 0 0 / 0.6) 50%, transparent 62%);
    transform: translateX(130%);
    animation: pop-archive-glint-rev 200ms cubic-bezier(0.4, 0, 0.2, 1) 120ms;
  }
  @keyframes pop-shing {
    0%   { transform: scale(1);     filter: brightness(1);    }
    12%  { transform: scale(0.98);  filter: brightness(1);    }
    30%  { transform: scale(1.012); filter: brightness(1.55); }
    42%  { transform: scale(0.995); filter: brightness(1);    }
    64%  { transform: translateY(9px) scale(0.985); opacity: 0.2; }
    80%  { transform: translateY(11px) scale(0.98); opacity: 0.04; }
    100% { transform: translateY(11px) scale(0.98); opacity: 0; }
  }

  /* vacuum */
  .popping.pop--archiveVacuum { transform-origin: right center; animation: pop-vacuum 500ms cubic-bezier(0.5, 0, 0.75, 0); }
  .popping.pop--archiveVacuum::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(95deg, transparent 30%, oklch(1 0 0 / 0.8) 49%, oklch(1 0 0 / 1) 50%, oklch(1 0 0 / 0.8) 51%, transparent 70%);
    mix-blend-mode: screen;
    transform: translateX(-130%);
    animation: pop-archive-glint 200ms cubic-bezier(0.4, 0, 0.2, 1) 40ms;
  }
  @keyframes pop-vacuum {
    0%   { transform: translate(0, 0) scaleX(1) scaleY(1) skewX(0);             filter: blur(0); }
    14%  { transform: translate(0, 0) scaleX(1.03) scaleY(0.97) skewX(0);       filter: blur(0); }
    24%  { transform: translate(0, 0) scaleX(1) scaleY(1) skewX(0);             filter: blur(0); }
    62%  { transform: translate(18px, 10px) scaleX(0.7) scaleY(0.92) skewX(-8deg);  filter: blur(0.6px); opacity: 0.3; }
    80%  { transform: translate(34px, 14px) scaleX(0.45) scaleY(0.85) skewX(-14deg); filter: blur(1.4px); opacity: 0.04; }
    100% { transform: translate(40px, 16px) scaleX(0.3) scaleY(0.8) skewX(-16deg);  filter: blur(2px);   opacity: 0; }
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
