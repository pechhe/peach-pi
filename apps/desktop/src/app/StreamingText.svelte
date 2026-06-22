<script module lang="ts">
  // Reveal progress must survive the component remount a thread switch causes:
  // App.svelte wraps ThreadView in {#key thread:id}, so switching away and back
  // destroys + recreates every StreamingText. Keyed by a stable per-message id,
  // returning to a thread resumes the wave instead of replaying it from char 0.
  type RevealMemory = { revealed: number; times: Map<number, number> };
  const revealMemory = new Map<string, RevealMemory>();
  function memoryFor(key: string): RevealMemory {
    let m = revealMemory.get(key);
    if (!m) {
      m = { revealed: 0, times: new Map() };
      revealMemory.set(key, m);
    }
    return m;
  }
</script>

<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import { untrack } from "svelte";

  /**
   * Streaming assistant text with a smooth, Codex-style reveal. Two layers:
   *
   * 1. A render-side typewriter buffer. Provider deltas arrive in bursts; this
   *    decouples the visible reveal from the network cadence by trickling chars
   *    at a fixed rate per frame (speed from <html data-stream-speed>).
   *
   * 2. Per-word fade-in. The parsed markdown has every word wrapped in
   *    <span class="sw"> with an inline animation-delay equal to
   *    (revealTime - now), so already-revealed words mount with a negative
   *    delay → they render at the final frame instantly (no flicker), and only
   *    the freshly-revealed tail word animates. The look is composed from the
   *    `.sw` CSS tokens on <html data-stream-fx>.
   *
   * Why the negative-delay trick survives Svelte's `{@html}`: every typewriter
   * tick replaces innerHTML, so all spans are brand-new elements. Setting each
   * span's delay to revealTime-now means its effective animation position is
   * (now - revealTime) = real elapsed time, which is continuous across remounts
   * — so the wave looks unbroken even though the DOM is rebuilt each tick.
   */
  let {
    text,
    streaming = true,
    plain = false,
    revealKey,
  }: { text: string; streaming?: boolean; plain?: boolean; revealKey?: string } = $props();

  function escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  }

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Steady-rate reveal at char boundaries. Each active frame advances `step`
  // chars; `tickEvery` skips frames at slower speeds so the trickle stays
  // visible at low backlog.
  const SPEED_TABLE = {
    low: { step: 1, tickEvery: 4 }, // ~15 chars/sec @60fps
    medium: { step: 1, tickEvery: 2 }, // ~30 chars/sec
    high: { step: 1, tickEvery: 1 }, // ~60 chars/sec
  } as const;
  // When the buffer runs this far ahead, the provider is dumping faster than we
  // trickle. Past this we jump to whole-word boundaries so each word's span
  // fades as one unit (clean wave) instead of growing mid-fade.
  const WORD_SNAP_BACKLOG = 16;
  // Adaptive catch-up: past WORD_SNAP_BACKLOG we drain this fraction of the
  // backlog per active frame (snapped to a word boundary). Bounds visible lag
  // so a fast provider burst is chased down in a few frames instead of
  // trickling one word/frame forever and lagging after the stream ends.
  const CATCHUP_FRACTION = 0.15;

  function resolveRate() {
    const raw = document.documentElement.getAttribute("data-stream-speed");
    return SPEED_TABLE[(raw as keyof typeof SPEED_TABLE) ?? "medium"] ?? SPEED_TABLE.medium;
  }

  // Reveal index of the end of the word at/after `from`.
  function nextWordBoundary(s: string, from: number): number {
    let i = from;
    while (i < s.length && !/\s/.test(s[i]!)) i += 1;
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    return i;
  }

  // First word boundary at/after char index `target`. Reveals whole words
  // (never mid-word) while catching up across many words in one frame.
  function wordBoundaryAtOrAfter(s: string, from: number, target: number): number {
    let i = from;
    while (i < target && i < s.length) i = nextWordBoundary(s, i);
    return Math.min(i, s.length);
  }

  // During streaming the revealed slice often ends mid inline-code (before its
  // closing backtick). Close a dangling one so it renders as styled code right
  // away; the real closer replaces ours next frame. Skips inside a ``` fence.
  function closeDanglingInlineCode(s: string): string {
    const fences = s.match(/```/g);
    if (fences && fences.length % 2 === 1) return s;
    const ticks = (s.replace(/```/g, "").match(/`/g) ?? []).length;
    return ticks % 2 === 1 ? `${s}\`` : s;
  }

  // Reveal progress persists across remounts when a stable revealKey is given
  // (see <script module>); without one (or for historical text) it stays local.
  const mem: RevealMemory = untrack(() =>
    revealKey ? memoryFor(revealKey) : { revealed: 0, times: new Map() },
  );
  // Historical (non-streaming) messages mount fully revealed — no replay.
  // untrack: snapshot the mount-time prop values only; resume from the stored
  // index so a thread switch mid-stream continues instead of restarting.
  let revealed = $state(untrack(() => (streaming && !reduceMotion ? mem.revealed : text.length)));
  const rate = resolveRate();
  let frame = 0;
  // word index → first time (performance.now) we saw it. Drives per-word delay.
  const revealTimes = mem.times;

  // Free the shared memory once the message is done streaming — at that point
  // the reveal slice is unused (the `!streaming` branch below returns raw HTML).
  $effect(() => {
    if (!streaming && revealKey) revealMemory.delete(revealKey);
  });

  $effect(() => {
    if (reduceMotion) {
      revealed = text.length;
      return;
    }
    // Track `text` so the loop (re)starts as new deltas arrive. `revealed` is
    // only read/written inside the rAF callback, so the effect never depends
    // on it (no teardown churn per revealed char).
    const target = text;
    let raf = 0;
    const tick = () => {
      frame += 1;
      if (frame % rate.tickEvery === 0 && revealed < target.length) {
        const backlog = target.length - revealed;
        let next: number;
        if (backlog > WORD_SNAP_BACKLOG) {
          // Drain a fraction of the backlog this frame, snapped up to a whole
          // word, so big bursts are chased down fast instead of one word/frame.
          const advance = Math.max(1, Math.ceil(backlog * CATCHUP_FRACTION));
          next = wordBoundaryAtOrAfter(target, revealed, revealed + advance);
          if (next <= revealed) next = Math.min(revealed + 1, target.length);
        } else {
          next = revealed + Math.min(rate.step, backlog);
        }
        revealed = next;
        mem.revealed = next;
      }
      if (revealed < target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const displayed = $derived.by(() => {
    const slice = text.slice(0, Math.min(revealed, text.length));
    return plain ? slice : closeDanglingInlineCode(slice);
  });

  // Parse markdown, then walk the sanitized DOM wrapping each word (outside
  // code/pre) in <span class="sw" style="animation-delay:…">. Done together so
  // the per-word delays are recomputed against `performance.now()` each tick.
  const html = $derived.by(() => {
    // plain: thinking/raw text — no markdown, whitespace preserved via CSS.
    const raw = plain
      ? escapeHtml(displayed)
      : DOMPurify.sanitize(marked.parse(displayed, { async: false, breaks: true }) as string);
    // Historical messages (streaming=false) skip per-word animation spans.
    // The `.message-streaming` CSS only animates `.sw` elements, so returning
    // raw HTML here avoids the mount-time blur/fade on thread load.
    if (reduceMotion || !streaming) return raw;
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const now = performance.now();
    let wordIndex = 0;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const node = n as Text;
      if (node.parentElement?.closest("code, pre")) continue;
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      textNodes.push(node);
    }
    for (const node of textNodes) {
      const parts = node.nodeValue!.split(/(\s+)/).filter((p) => p.length > 0);
      const frag = doc.createDocumentFragment();
      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          frag.appendChild(doc.createTextNode(part));
          continue;
        }
        const i = wordIndex++;
        if (!revealTimes.has(i)) revealTimes.set(i, now);
        const span = doc.createElement("span");
        span.className = "sw";
        span.style.animationDelay = `${revealTimes.get(i)! - now}ms`;
        span.textContent = part;
        frag.appendChild(span);
      }
      node.replaceWith(frag);
    }
    return doc.body.innerHTML;
  });
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized via DOMPurify / escaped above -->
<div class="message-streaming" class:md={!plain} class:message-streaming--plain={plain}>{@html html}</div>

<style>
  /* Block + per-word styles intentionally live in styles/app.css so the
     `[data-stream-fx]` tokens on <html> can target the `.sw` spans (scoped
     Svelte styles can't reach a global ancestor selector). */
</style>
