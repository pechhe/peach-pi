<script lang="ts">
  import { tweened } from "svelte/motion";
  import StreamingText from "./StreamingText.svelte";

  /**
   * Capped, scrollable thinking surface. The reasoning text used to render in
   * an uncapped bordered div whose left rail grew in word-reveal steps and
   * could swallow the whole window. Here the box is capped to 50vh (the prior
   * step stays visible), grows a smooth tweened rail instead of stepping, and
   * pins to the bottom while streaming so the freshest reasoning is always in
   * view and the top scrolls away.
   */
  let {
    text,
    streaming = true,
    cursor = false,
    revealKey,
  }: {
    text: string;
    streaming?: boolean;
    cursor?: boolean;
    revealKey?: string;
  } = $props();

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Smoothed mirror of the visible box height. The side rail reads this so its
  // growth eases across frames instead of jumping per revealed word.
  const rail = tweened(0, { duration: reduceMotion ? 0 : 110, easing: (t) => t });

  let scrollEl: HTMLDivElement | undefined = $state();
  // True while the eased glide loop is driving scrollTop — used to suppress the
  // scrollbar thumb (incl. :hover) during auto-follow so nothing shows while
  // streaming. Real user scrolls still reveal it via the global .is-scrolling
  // pattern once the glide is idle.
  let glideActive = $state(false);
  // User is parked at the bottom of the thinking surface — keep pinning there.
  // A scroll-up clears it so re-reading earlier reasoning isn't yanked away.
  let atBottom = true;
  // True while the eased glide loop is driving scrollTop. The global
  // auto-hide-scrollbar handler in main.ts keys the `is-scrolling` thumb off
  // any `scroll` event — including these programmatic ones — which would show
  // the bar the whole time we're following. We tag glide-driven scrolls so the
  // global listener can skip them; only real user scrolls reveal the thumb.
  let glidingScroll = false;
  // Same intent-based following as the main thread: a single scrollTop dip
  // during streaming (the glide trailing a burst, a layout shift) must not flip
  // atBottom off and drop following. Accumulate sustained upward motion and
  // only disengage past a threshold.
  const SCROLL_UP_THRESHOLD = 80;
  const NEAR_BOTTOM = 16;
  let lastScrollTop = 0;
  let upwardAccum = 0;

  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    if (glidingScroll) {
      lastScrollTop = el.scrollTop;
      return;
    }
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const delta = el.scrollTop - lastScrollTop;
    lastScrollTop = el.scrollTop;
    if (delta < 0) {
      upwardAccum += -delta;
      if (upwardAccum >= SCROLL_UP_THRESHOLD) atBottom = false;
    } else {
      upwardAccum = 0;
      if (gap <= NEAR_BOTTOM) atBottom = true;
    }
  }

  function onWheel(e: WheelEvent) {
    if (e.deltaY < 0) {
      upwardAccum += -e.deltaY;
      if (upwardAccum >= SCROLL_UP_THRESHOLD) atBottom = false;
    } else {
      upwardAccum = 0;
    }
  }

  // ── Batched bottom-follow ─────────────────────────────────────────
  // The thinking box is tiny (≤50vh). The earlier per-frame eased glide
  // (ease scrollTop toward the live bottom every rAF) read as micro-jitter
  // here: the typewriter grows scrollHeight in uneven per-frame steps (1 word
  // / 3 words / 1 word …), and because the eased velocity is proportional to
  // the remaining gap, each growth step pulses the velocity. The eye is
  // sensitive to *velocity change*, not position, so on this small surface
  // that reads as micro-variations in scroll speed.
  //
  // Fix: don't chase the bottom every frame. Let content accumulate a small
  // buffer below the fold and only then run ONE closed-form ease-out tween
  // to the bottom — a calm nudge, then a pause while the buffer rebuilds,
  // then another nudge. Each tween is fixed-duration with a target captured
  // at start, so its perceived speed is constant (no coupling to per-frame
  // growth), and tween frames don't even read scrollHeight (no reflow).
  //
  // SCROLL_BATCH_PX = how much unscrolled content we tolerate below the fold
  // before nudging. ~3 lines of the small thinking text; big enough to read
  // as a deliberate "a few lines appeared" motion, small enough to never lag
  // the freshest reasoning by more than a blink.
  const SCROLL_BATCH_PX = 60;
  // Tween duration. Slow enough to feel like a calm drift, not a nudge.
  const SCROLL_TWEEN_MS = 320;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  let glideRaf = 0;
  // Active nudge; null while idle/buffering (waiting for content to accrue).
  let tween: { from: number; to: number; t0: number } | null = null;

  function followLoop(ts: number) {
    const e = scrollEl;
    if (!e) {
      glideRaf = 0;
      return;
    }
    // User scrolled up and no tween to finish — stop following; the effect
    // re-arms if they return to the bottom (atBottom flips back true).
    if (!atBottom && !tween) {
      stopFollow();
      return;
    }

    if (tween) {
      // Advance the in-flight nudge. Target captured at start → constant
      // perceived speed, immune to per-frame scrollHeight jitter.
      if (!atBottom) {
        tween = null; // abandoned mid-tween on scroll-up
      } else {
        const p = Math.min(1, (ts - tween.t0) / SCROLL_TWEEN_MS);
        e.scrollTop = tween.from + (tween.to - tween.from) * easeOut(p);
        if (p >= 1) tween = null;
      }
    } else if (!streaming) {
      // Stream ended: settle exactly to the bottom (clears any leftover
      // buffer < SCROLL_BATCH_PX so the final line isn't left tucked below).
      const target = e.scrollHeight - e.clientHeight;
      if (atBottom && target - e.scrollTop > 0.5) e.scrollTop = target;
      else {
        stopFollow();
        return;
      }
    } else if (atBottom) {
      // Streaming, idle: let a buffer accrue, nudge once it crosses threshold.
      const target = e.scrollHeight - e.clientHeight;
      if (target - e.scrollTop >= SCROLL_BATCH_PX) {
        tween = { from: e.scrollTop, to: target, t0: ts };
      }
    }
    glideRaf = requestAnimationFrame(followLoop);
  }

  function startFollow() {
    const el = scrollEl;
    if (!el || glideRaf) return;
    glideActive = true;
    // Suppress the scrollbar thumb (incl. :hover) for the whole follow and
    // skip onScroll's atBottom logic for our programmatic scrolls — set once
    // here, clear once on stopFollow. (Was a per-frame set/delete before.)
    el.dataset.glideScroll = "1";
    glidingScroll = true;
    glideRaf = requestAnimationFrame(followLoop);
  }

  function stopFollow() {
    glideActive = false;
    glidingScroll = false;
    tween = null;
    const e = scrollEl;
    if (e) delete e.dataset.glideScroll;
  }

  // Arm the batched follow while pinned to the bottom. Tracks `text` so a
  // burst re-checks the buffer promptly (startFollow no-ops if already armed).
  // When streaming ends we do NOT stop here — followLoop runs a final settle
  // to the exact bottom and self-terminates.
  $effect(() => {
    void text;
    if (scrollEl && streaming && atBottom) startFollow();
  });

  $effect(() => {
    return () => {
      cancelAnimationFrame(glideRaf);
      stopFollow();
    };
  });

  // Rail height = the visible box height (clientHeight), tweened. The rail is
  // decorative (a 2px side bar trailing the box) and the box already grows
  // visibly as reasoning streams, so continuous tween updates during streaming
  // are pure churn: ResizeObserver fires per layout step, each kick drives a
  // tweened reactive update + re-render of the rail span. Observe only while
  // NOT streaming — the box is static then, so the rail settles to final size.
  // During streaming the rail holds its last-set height; the visible box growth
  // carries the motion. Trailing by a few px is invisible against faint text.
  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    if (streaming) return;
    rail.set(el.clientHeight);
    const ro = new ResizeObserver(() => {
      rail.set(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<div class="thinking-block">
  <div class="thinking-scroll" class:glide-active={glideActive} bind:this={scrollEl} onscroll={onScroll} onwheel={onWheel}>
    <StreamingText {text} {streaming} plain {cursor} {revealKey} />
  </div>
  <span class="thinking-rail" style="height:{$rail}px"></span>
</div>

<style>
  .thinking-block {
    position: relative;
    margin-top: 0.375rem;
    /* pl-3 keeps the rail off the text, matching the old border-l-2 + pl-3. */
    padding-left: 0.75rem;
  }
  .thinking-scroll {
    max-height: 50vh;
    overflow-y: auto;
    /* Reserve the scrollbar gutter even before overflow so the box doesn't
       lose 8px of content width the instant text passes 50vh — that width
       change reflowed every streamed line and read as jitter exactly at the
       growth→scroll transition. Thumb stays transparent (see below) so this
       only stabilises layout, no visual cost. */
    scrollbar-gutter: stable;
    /* Matches the old text-xs / leading-relaxed / text-faint on the div. */
    font-size: 0.75rem;
    line-height: 1.625;
    color: var(--color-faint);
  }
  /* While the eased glide is auto-following, force the thumb fully transparent
     (incl. :hover) so nothing shows during streaming. The cursor parked over the
     box would otherwise reveal the thumb via the global :hover rule. Real user
     scrolls (glide idle) still get the thumb via the .is-scrolling pattern. */
  .thinking-scroll.glide-active::-webkit-scrollbar-thumb,
  .thinking-scroll.glide-active::-webkit-scrollbar-thumb:hover {
    background: transparent;
  }
  .thinking-rail {
    position: absolute;
    left: 0;
    top: 0;
    width: 2px;
    background: var(--color-border);
    pointer-events: none;
    border-radius: 9999px;
    /* Inherit the theme's scrollbar styling (transparent until hover). */
  }
</style>
