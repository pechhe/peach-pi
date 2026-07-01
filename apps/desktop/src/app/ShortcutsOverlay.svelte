<script lang="ts">
  // In-place keyboard-shortcut hints. Two ways in:
  //   • Hold ⌘ alone for HOLD_MS → *peek* (vanishes on release).
  //   • ⌘/ → *pinned* (stays until Esc / backdrop click).
  // The peek timer is cancelled the moment any other key is pressed, so a real
  // shortcut (⌘K, ⌘⇧↑, …) never makes the hints flash — only ⌘ held on its own.
  //
  // Rendering (Option A): a portaled dim scrim over the app, plus a floating
  // badge measured onto every visible control carrying a `data-kbd-hint="⌘B"`
  // attribute. The badge text IS the attribute value, so the catalogue lives on
  // the real controls and can't drift. Uses the ⌘K palette's motion tokens.
  import { motion } from "motion-sv";
  import { portal } from "../lib/beui/portal";
  import { EASE_OUT } from "../lib/beui/ease";

  const HOLD_MS = 500;

  type Hint = { keys: string[]; left: number; top: number };

  let pinned = $state(false);
  let peek = $state(false);
  let mounted = $state(false);
  let hints = $state<Hint[]>([]);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const open = $derived(pinned || peek);

  $effect(() => {
    mounted = true;
  });

  // Measure every visible [data-kbd-hint] control and place a badge at its
  // top-right corner. Skips elements that are display:none / zero-size / fully
  // off-screen so hidden panels (collapsed sidebar, no open thread) contribute
  // nothing.
  function measure() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next: Hint[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-kbd-hint]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const raw = el.dataset.kbdHint ?? "";
      if (!raw) continue;
      next.push({
        keys: raw.split(/\s+/).filter(Boolean),
        left: Math.min(vw - 8, r.right),
        top: Math.max(8, r.top),
      });
    }
    hints = next;
  }

  // Recompute while visible; keep badges glued to their controls through
  // scroll/resize/layout shifts.
  $effect(() => {
    if (!open) return;
    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const raf = requestAnimationFrame(measure); // catch post-open layout settle
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  });

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    peek = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      pinned = !pinned;
      cancelHold();
      return;
    }
    if (e.key === "Escape" && pinned) {
      e.preventDefault();
      pinned = false;
      return;
    }
    // Bare ⌘ (or Ctrl) held alone → arm the peek timer. Ignore key-repeat.
    if ((e.key === "Meta" || e.key === "Control") && !e.repeat) {
      if (!holdTimer && !peek) {
        holdTimer = setTimeout(() => {
          peek = true;
          holdTimer = null;
        }, HOLD_MS);
      }
      return;
    }
    // Any other key means a real shortcut (or typing) — never peek.
    cancelHold();
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.key === "Meta" || e.key === "Control") cancelHold();
  }
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onblur={cancelHold} />

{#if mounted}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    aria-hidden={!open}
    data-testid="shortcuts-overlay"
    class="pointer-events-none fixed inset-0 z-[100]"
  >
    <!-- No dim/blur — the app stays fully visible so you can see what the
         shortcuts act on. Transparent click-catcher only when pinned, so a
         click dismisses it; a peek is dismissed by releasing ⌘. -->
    {#if pinned}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="pointer-events-auto absolute inset-0" onclick={() => (pinned = false)}></div>
    {/if}

    {#if open}
      {#each hints as hint, i (i)}
        <!-- Plain positioned wrapper (string style + centering translate); the
             inner motion.div owns the scale/opacity pop so its inline transform
             never clobbers the translate. -->
        <div
          class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style="left:{hint.left}px;top:{hint.top}px"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: EASE_OUT, delay: Math.min(i * 0.012, 0.12) }}
            class="flex items-center gap-0.5"
          >
            {#each hint.keys as key}
              <kbd
                class="rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg shadow-lg"
              >
                {key}
              </kbd>
            {/each}
          </motion.div>
        </div>
      {/each}
    {/if}
  </div>
{/if}
