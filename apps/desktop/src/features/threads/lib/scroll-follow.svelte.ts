/**
 * Per-thread transcript scroll/follow controller.
 *
 * Streaming grows the content height in chunks; snapping scrollTop to the
 * bottom on every growth reads as a jerky page. Instead we ease scrollTop
 * toward the bottom across rAF frames (time-based decay, not a per-frame
 * fraction, so it's frame-rate independent). The loop stays armed for the
 * whole streaming run instead of ending at each `diff <= 0.5` and re-arming
 * from rest — the old settle→restart-from-rest cycle was the main visible
 * jank. The target is recomputed every frame, so mid-glide height jumps (new
 * tokens, tool blocks) are followed live.
 *
 * Intent-based following: a single tiny `scrollTop` dip during streaming
 * (layout shifts, composer resize, trackpad inertia) used to flip scrolledUp
 * on and drop following. Instead we accumulate sustained upward motion and
 * only disengage past a threshold.
 */
export class ScrollFollow {
  scrolledUp = $state(false);
  scrollEl = $state<HTMLElement | null>(null);
  didInitialScroll = $state(false);

  // Distance from the bottom we still treat as "following". Small: only a
  // genuine return to the bottom re-arms the pin.
  private readonly NEAR_BOTTOM = 24;
  // Following only disengages once the user has scrolled up by at least this
  // many px CUMULATIVELY in one upward gesture.
  private readonly SCROLL_UP_THRESHOLD = 80;
  // seconds; higher = gentler. ~140ms time constant.
  private readonly GLIDE_TAU = 0.14;

  private lastScrollTop = 0;
  // Accumulated upward distance since the last downward/near-bottom motion.
  private upwardAccum = 0;
  private glideRaf = 0;
  private gliding = false;
  private lastGlideTs = 0;

  constructor(private readonly isRunning: () => boolean) {}

  onScroll = (): void => {
    const el = this.scrollEl;
    if (!el) return;
    // During the eased bottom-follow glide we set data-glide-scroll once at
    // glide start (see glideToBottom). Skip the layout-triggering math below
    // for those programmatic scrolls.
    if (el.dataset.glideScroll) {
      this.lastScrollTop = el.scrollTop;
      return;
    }
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const delta = el.scrollTop - this.lastScrollTop;
    this.lastScrollTop = el.scrollTop;
    if (delta < 0) {
      this.upwardAccum += -delta;
      if (this.upwardAccum >= this.SCROLL_UP_THRESHOLD) this.scrolledUp = true;
    } else {
      // Any downward motion cancels a pending upward-intent accumulation.
      this.upwardAccum = 0;
      if (gap <= this.NEAR_BOTTOM) this.scrolledUp = false;
    }
  };

  onWheel = (e: WheelEvent): void => {
    if (e.deltaY < 0) {
      this.upwardAccum += -e.deltaY;
      if (this.upwardAccum >= this.SCROLL_UP_THRESHOLD) this.scrolledUp = true;
    } else {
      this.upwardAccum = 0;
    }
  };

  glideToBottom(): void {
    const el = this.scrollEl;
    if (!el || this.gliding) return;
    this.gliding = true;
    this.lastGlideTs = 0;
    // Tag the element once at glide start so the global auto-hide-scrollbar
    // listener (main.ts) skips every programmatic scroll while we follow a
    // streaming turn (previously set+deleted EVERY frame — a per-frame cost).
    el.dataset.glideScroll = "1";
    const stop = () => {
      this.gliding = false;
      const e = this.scrollEl;
      if (e) delete e.dataset.glideScroll;
    };
    const step = (ts: number) => {
      const e = this.scrollEl;
      if (!e || this.scrolledUp) {
        stop();
        return;
      }
      if (!this.lastGlideTs) this.lastGlideTs = ts;
      // Clamp dt so a tab-throttled gap doesn't dump the whole backlog in one
      // frame (the rAF timestamp jumps after backgrounding).
      const dt = Math.min(0.05, (ts - this.lastGlideTs) / 1000);
      this.lastGlideTs = ts;
      const target = e.scrollHeight - e.clientHeight;
      const diff = target - e.scrollTop;
      // While the thread is still running, keep the loop armed even at a
      // momentary zero gap so the next burst continues the same motion
      // instead of restarting from rest. Idle (not running) settles out.
      const running = this.isRunning();
      if (diff <= 0.5 && !running) {
        e.scrollTop = target;
        stop();
        return;
      }
      const factor = 1 - Math.exp(-dt / this.GLIDE_TAU);
      e.scrollTop = e.scrollTop + diff * factor;
      this.glideRaf = requestAnimationFrame(step);
    };
    this.glideRaf = requestAnimationFrame(step);
  }

  scrollToBottom(): void {
    const el = this.scrollEl;
    if (!el) return;
    this.scrolledUp = false;
    this.upwardAccum = 0;
    this.glideToBottom();
  }

  // Re-arm following when a new item lands and the user is still near the
  // bottom. A transient trackpad-inertia tick can otherwise leave scrolledUp
  // true with the user only a few px above the bottom; without this they
  // silently stop following the new turn.
  rearmIfNearBottom(): void {
    const el = this.scrollEl;
    if (!el || !this.scrolledUp) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap <= this.NEAR_BOTTOM) {
      this.scrolledUp = false;
      this.upwardAccum = 0;
    }
  }

  dispose?(): void {
    cancelAnimationFrame(this.glideRaf);
  }
}
