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

  // ── Eased bottom-follow (mirrors ThreadView's main glide) ──────────
  // Same time-based exponential decay + continuous-while-streaming loop as the
  // main thread scroll, so bursts inside the capped box flow instead of
  // lurching. Keeping one loop armed through the whole streaming run avoids
  // the settle→restart-from-rest jank a per-burst lerp produces.
  const GLIDE_TAU = 0.14; // seconds; higher = gentler.
  let glideRaf = 0;
  let gliding = false;
  let lastTs = 0;
  function glideToBottom() {
    const el = scrollEl;
    if (!el || gliding) return;
    gliding = true;
    glideActive = true;
    lastTs = 0;
    const step = (ts: number) => {
      const e = scrollEl;
      if (!e || !atBottom) {
        gliding = false;
        glideActive = false;
        glidingScroll = false;
        return;
      }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      const target = e.scrollHeight - e.clientHeight;
      const diff = target - e.scrollTop;
      if (diff <= 0.5 && !streaming) {
        e.scrollTop = target;
        gliding = false;
        glideActive = false;
        glidingScroll = false;
        return;
      }
      const factor = 1 - Math.exp(-dt / GLIDE_TAU);
      // Tag this as a programmatic scroll so the global auto-hide-scrollbar
      // listener skips it (no thumb while following) and onScroll doesn't
      // re-evaluate atBottom off the glide's own trailing dip.
      glidingScroll = true;
      e.dataset.glideScroll = "1";
      e.scrollTop = e.scrollTop + diff * factor;
      // Clear deferred: the scroll event from the assignment above is queued
      // asynchronously and fires after this step returns, so a sync delete
      // would race it and the flag would already be gone. setTimeout(0) lands
      // after the queued event, covering it; the next step re-sets the flag
      // before this fires, so it stays set throughout the continuous glide.
      setTimeout(() => {
        delete e.dataset.glideScroll;
      }, 0);
      glidingScroll = false;
      glideRaf = requestAnimationFrame(step);
    };
    glideRaf = requestAnimationFrame(step);
  }

  // Pin to the bottom while streaming (top scrolls off) unless the user
  // scrolled up to re-read. Tracks `text` so it re-runs as reasoning grows;
  // the eased loop retargets every frame to the live bottom.
  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    void text;
    if (streaming && atBottom) glideToBottom();
  });

  $effect(() => {
    return () => cancelAnimationFrame(glideRaf);
  });

  // Rail height = the visible box height (clientHeight), tweened. ResizeObserver
  // fires per layout step as text streams in; the tween smooths those steps into
  // continuous growth. The rail is decorative — trailing the box by a few px is
  // invisible against faint text and reads as fluid motion.
  $effect(() => {
    const el = scrollEl;
    if (!el) return;
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
