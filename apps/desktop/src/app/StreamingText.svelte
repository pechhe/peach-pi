<script module lang="ts">
  // Per-word first-seen timestamps must survive the component remount a thread
  // switch causes: App.svelte wraps ThreadView in {#key thread:id}, so switching
  // away and back destroys + recreates every StreamingText. Keyed by a stable
  // per-message id, already-revealed words keep their first-seen time across the
  // remount so the rebuild doesn't re-fire their fade.
  type RevealMemory = { times: Map<string, number> };
  const revealMemory = new Map<string, RevealMemory>();
  function memoryFor(key: string): RevealMemory {
    let m = revealMemory.get(key);
    if (!m) {
      m = { times: new Map() };
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
    cursor = false,
    revealKey,
  }: {
    text: string;
    streaming?: boolean;
    plain?: boolean;
    /** Render a blinking caret inline at the end of the streamed text. */
    cursor?: boolean;
    revealKey?: string;
  } = $props();

  function escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  }

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Time-based, adaptive reveal. Each speed maps the current backlog onto a
  // per-word interval: the whole backlog is scheduled to drain within ~windowMs,
  // clamped between minMs (burst floor — keeps fast dumps flowing) and maxMs
  // (calm trickle near the model's real cadence). Reveal is frame-rate
  // independent: a frame reveals as many whole words as the schedule allows.
  const WAVE = {
    low: { minMs: 16, maxMs: 72, windowMs: 900 },
    medium: { minMs: 9, maxMs: 52, windowMs: 650 },
    high: { minMs: 5, maxMs: 34, windowMs: 420 },
  } as const;
  // Rough chars-per-word (incl. trailing space) to turn a char backlog into a
  // word count for the interval calc.
  const AVG_WORD_LEN = 6;
  // Hard ceiling on words revealed in a single frame so an extreme burst still
  // unfurls over a few frames instead of dumping one giant block.
  const MAX_WORDS_PER_FRAME = 10;
  // Per-word fade scheduling (see `waveCursor`).
  const WAVE_STAGGER = 30;
  const MAX_AHEAD = 450;

  function resolveWave() {
    const raw = document.documentElement.getAttribute("data-stream-speed");
    return WAVE[(raw as keyof typeof WAVE) ?? "medium"] ?? WAVE.medium;
  }

  // Reveal index of the end of the word at/after `from`.
  function nextWordBoundary(s: string, from: number): number {
    let i = from;
    while (i < s.length && !/\s/.test(s[i]!)) i += 1;
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    return i;
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
    revealKey ? memoryFor(revealKey) : { times: new Map() },
  );
  // Mount fully revealed: any text already accumulated (history, or a backlog
  // that grew while the user was on another thread) renders in one go. Only
  // deltas arriving *after* mount get the typewriter trickle + per-word fade —
  // see the `$effect` rAF loop below (kicks in when `text` grows past
  // `revealed`) and the `firstBuild` anchor in the html builder.
  let revealed = $state(untrack(() => text.length));
  const wave = resolveWave();
  // True until the first html build completes. Lets that first build anchor
  // every already-present word to a far-past delay (final frame, no fade) so
  // jumping to full text doesn't flash-fade the whole message.
  let firstBuild = true;
  // Wave scheduler for the per-word fade. As words enter the DOM each gets a
  // reveal timestamp a little after the previous one (WAVE_STAGGER), so even a
  // multi-word frame fades in left-to-right rather than as a block. Floored at
  // `now` (a slow trickle reveals in real time) and capped at now+MAX_AHEAD so
  // the wave never schedules unboundedly into the future — bounded lag, stable
  // ordering. Resets naturally on remount.
  let waveCursor = 0;
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
    let last = performance.now();
    let acc = 0;
    const tick = (ts: number) => {
      const dt = ts - last;
      last = ts;
      if (revealed < target.length) {
        const pendingWords = Math.max(1, Math.ceil((target.length - revealed) / AVG_WORD_LEN));
        const interval = Math.min(wave.maxMs, Math.max(wave.minMs, wave.windowMs / pendingWords));
        acc += dt;
        let budget = MAX_WORDS_PER_FRAME;
        while (revealed < target.length && acc >= interval && budget > 0) {
          revealed = nextWordBoundary(target, revealed);
          acc -= interval;
          budget -= 1;
        }
        // After a tab-throttle gap don't dump the whole backlog in one frame.
        if (acc > interval * 6) acc = interval;
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
    // Per-word reveal times are keyed by `text\u0000occurrence`, NOT by document
    // position. Markdown re-tokenization between builds (code/pre regions that
    // toggle in/out as backticks/fences stream in are skipped by the walker)
    // shifts positional indices, which made later words inherit earlier words'
    // timestamps — the out-of-order fade. A text+occurrence key is stable across
    // re-parses: a word keeps its first-seen time even as neighbours change.
    const occ = new Map<string, number>();
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
        const seen = occ.get(part) ?? 0;
        occ.set(part, seen + 1);
        const key = `${part}\u0000${seen}`;
        // Words already in the buffer at mount render at the final frame — no
        // flash-fade of the whole backlog. Only words revealed while the user
        // is actively watching (first build already done) get the per-word wave.
        if (!revealTimes.has(key)) {
          if (firstBuild) {
            revealTimes.set(key, now - 1_000_000);
          } else {
            waveCursor = Math.min(now + MAX_AHEAD, Math.max(now, waveCursor + WAVE_STAGGER));
            revealTimes.set(key, waveCursor);
          }
        }
        const span = doc.createElement("span");
        span.className = "sw";
        span.style.animationDelay = `${revealTimes.get(key)! - now}ms`;
        span.textContent = part;
        frag.appendChild(span);
      }
      node.replaceWith(frag);
    }
    firstBuild = false;
    // Streaming caret: only when the reveal has caught up to the available
    // text (revealed >= text.length) — i.e. the model has paused and we're
    // waiting for more. While words are still flowing in we hide it so the
    // text itself reads as the live thing. Position-wise it's tucked INSIDE
    // the content so it flows inline after the final word, not on a new line
    // below the block container. Markdown: last block element (<p>/<li>/…);
    // plain: the body itself. Once shown it persists (html stops rebuilding)
    // so the cursor-blink animation actually plays.
    if (cursor && revealed >= text.length) {
      const caret = doc.createElement("span");
      caret.className = "streaming-caret cursor-blink";
      const host = plain ? doc.body : (doc.body.lastElementChild ?? doc.body);
      host.appendChild(caret);
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
