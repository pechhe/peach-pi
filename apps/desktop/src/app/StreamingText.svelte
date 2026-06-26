<script module lang="ts">
  // Per-word first-seen timestamps must survive the component remount a thread
  // switch causes: App.svelte wraps ThreadView in {#key thread:id}, so switching
  // away and back destroys + recreates every StreamingText. Keyed by a stable
  // per-message id, already-revealed words keep their first-seen time across the
  // remount so the rebuild doesn't re-fire their fade.
  //
  // The cache fields (prefixHtml/prefixUpTo/occ) likewise survive the remount:
  // a stable revealKey means the same growing message, so the settled-prefix
  // cache is still valid across the destroy/recreate. See `html` below.
  type RevealMemory = {
    times: Map<string, number>;
    /** Cached spanned HTML for the settled (post-animation) prefix. */
    prefixHtml: string;
    /** Char offset in `displayed` that `prefixHtml` covers. */
    prefixUpTo: number;
    /** Running word-occurrence counts across the settled prefix, so per-word
     *  reveal keys (`word\u0000occurrence`) stay globally unique + stable when
     *  a block graduates from the live tail into the cached prefix. */
    occ: Map<string, number>;
  };
  const revealMemory = new Map<string, RevealMemory>();
  function memoryFor(key: string): RevealMemory {
    let m = revealMemory.get(key);
    if (!m) {
      m = { times: new Map(), prefixHtml: "", prefixUpTo: 0, occ: new Map() };
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
   *
   * PERF: the per-word span-wrap is O(words) and — without care — re-runs over
   * the WHOLE revealed slice every animation frame (marked.parse + DOMPurify +
   * TreeWalker + N span creations + innerHTML serialise). On a multi-KB reply
   * that blew the 16ms frame budget. The `html` derived below caches the prefix
   * that finished animating (baked spanned HTML, byte-identical to the live
   * render since a settled `.sw` holds its `to` state = plain text) and each
   * frame span-wraps only the still-animating tail. ~20x less per-frame work on
   * long messages, identical look. Falls back to the legacy full re-parse on any
   * edge hiccup (catch), so a boundary bug can only cost speed, never the look.
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
  // A word is safe to bake into the cached prefix once its fade has fully
  // completed: --sw-dur (stream-word-fx in app.css, default 560ms) + a safety
  // margin so an animating word is never frozen mid-fade.
  const SETTLE_MS = 560 + 240;

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

  // Latest cache-safe boundary (char right after a newline) at or before `from`.
  // Used to split the revealed slice into a cacheable prefix + a live tail.
  //
  // Markdown needs a BLANK line (block boundary): splitting mid-`<p>`/`<li>`
  // would render the tail out of context. We also skip inside an unclosed ```
  // fence. Plain (thinking) text is escaped HTML with no block structure, so a
  // single newline is a safe seam — and reasoning rarely contains blank lines,
  // so without this the cache would never settle and the whole growing thinking
  // text would re-span-wrap every frame (O(thinking length) per frame — the
  // "big thinking step is slow" symptom). Returns 0 when none exists.
  function safeBlockBoundary(s: string, from: number): number {
    if (plain) {
      let boundary = 0;
      for (let i = 0; i < from && i < s.length; i += 1) {
        if (s[i] === "\n" && i + 1 <= from) boundary = i + 1;
      }
      return boundary;
    }
    let boundary = 0;
    let inFence = false;
    let i = 0;
    while (i < from && i < s.length) {
      if (s.startsWith("```", i)) {
        inFence = !inFence;
        i += 3;
        continue;
      }
      if (!inFence && s[i] === "\n") {
        let j = i + 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t")) j += 1;
        if (j < s.length && s[j] === "\n") {
          const after = j + 1;
          if (after <= from) boundary = after;
        }
      }
      i += 1;
    }
    return boundary;
  }

  // Reveal progress persists across remounts when a stable revealKey is given
  // (see <script module>); without one (or for historical text) it stays local.
  const mem: RevealMemory = untrack(() =>
    revealKey ? memoryFor(revealKey) : { times: new Map(), prefixHtml: "", prefixUpTo: 0, occ: new Map() },
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
  // Sampled (revealedIdx, time) history from the rAF tick. `html` uses it to
  // find the slice that finished animating SETTLE_MS ago → cacheable prefix.
  // Capped; streaming bursts are short-lived. Only pushed when reveal advances.
  const revealHistory: { idx: number; t: number }[] = [];
  // Caret idle gate: the streaming caret should only appear once the reveal
  // has been caught up + idle for a beat, not on every brief catch-up frame
  // between close deltas (which made it flicker mid-stream). `revealIdle` is
  // reactive so the `html` derived re-wraps the tail to add/remove the caret.
  const CARET_HOLD_MS = 350;
  let revealIdle = $state(false);
  let caretTimer: ReturnType<typeof setTimeout> | 0 = 0;

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
        const before = revealed;
        while (revealed < target.length && acc >= interval && budget > 0) {
          revealed = nextWordBoundary(target, revealed);
          acc -= interval;
          budget -= 1;
        }
        // After a tab-throttle gap don't dump the whole backlog in one frame.
        if (acc > interval * 6) acc = interval;
        // Sample the reveal position so `html` can age out a cacheable prefix.
        revealHistory.push({ idx: revealed, t: ts });
        if (revealHistory.length > 240) revealHistory.shift();
        // Reveal advanced this frame → text is still flowing, so suppress the
        // caret (reset the idle gate; it's re-armed below once caught up).
        if (revealed !== before) {
          if (revealIdle) revealIdle = false;
          if (caretTimer) { clearTimeout(caretTimer); caretTimer = 0; }
        }
      }
      if (revealed < target.length) raf = requestAnimationFrame(tick);
      else if (!caretTimer) {
        // Caught up to the buffer: arm the caret. It only fires if we stay
        // caught up for CARET_HOLD_MS (no new text arrives) → "momentarily
        // stopped". New deltas re-run this effect (text dependency) and the
        // advance branch above clears the timer.
        caretTimer = setTimeout(() => {
          caretTimer = 0;
          revealIdle = true;
        }, CARET_HOLD_MS);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (caretTimer) { clearTimeout(caretTimer); caretTimer = 0; }
    };
  });

  const displayed = $derived.by(() => {
    const slice = text.slice(0, Math.min(revealed, text.length));
    return plain ? slice : closeDanglingInlineCode(slice);
  });

  // Sanitized (or escaped, for plain) raw HTML for a slice — no per-word spans.
  function rawHtmlOf(slice: string): string {
    return plain
      ? escapeHtml(slice)
      : DOMPurify.sanitize(marked.parse(slice, { async: false, breaks: true }) as string);
  }

  // Wrap every word (outside code/pre) in <span class="sw" style="animation-delay:…">.
  // `occ` is the running word-occurrence map (seeded with the prefix's counts for
  // the tail) so reveal keys (`word\u0000occurrence`) stay stable across the
  // prefix/tail split. `forceStatic` (prefix settle) anchors any unknown word to
  // a far-past delay so baked prefix words never re-animate; the tail passes
  // false so fresh words ride the per-word wave (or, on firstBuild, go static).
  function spanWrap(rawHtml: string, occ: Map<string, number>, forceStatic: boolean): string {
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    const now = performance.now();
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
          if (forceStatic || firstBuild) {
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
    // Streaming caret: tuck it INSIDE the content so it flows inline after
    // the final word, not on a new line below the block container. Markdown:
    // last block element (<p>/<li>/…); plain: the body itself. Only in the
    // live tail (never the baked prefix) and only when `revealIdle` — i.e.
    // the reveal has been caught up + idle for CARET_HOLD_MS, meaning the
    // model has momentarily stopped. Hidden while text is still flowing.
    if (cursor && !forceStatic && revealIdle) {
      const caret = doc.createElement("span");
      caret.className = "streaming-caret cursor-blink";
      const host = plain ? doc.body : (doc.body.lastElementChild ?? doc.body);
      host.appendChild(caret);
    }
    return doc.body.innerHTML;
  }

  // Parse markdown, sanitize, and (for the streaming path) span-wrap. The
  // streaming branch caches the settled prefix and span-wraps only the live tail
  // — see the component doc comment. The result is byte-for-byte the same render
  // as a full per-frame re-parse, just O(tail) instead of O(whole message).
  const html = $derived.by(() => {
    // Historical messages (streaming=false) + reduced-motion skip the per-word
    // animation entirely: plain sanitized HTML, no spans, no cache.
    if (reduceMotion || !streaming) {
      return plain
        ? escapeHtml(displayed)
        : DOMPurify.sanitize(marked.parse(displayed, { async: false, breaks: true }) as string);
    }
    try {
      const now = performance.now();
      // Char index revealed ~SETTLE_MS ago — definitely done animating, so safe
      // to bake into the cached prefix. 0 (no prefix) when history is younger
      // than the settle window (message just started / backlog mount).
      const lookback = now - SETTLE_MS;
      let recent = 0;
      for (let i = revealHistory.length - 1; i >= 0; i--) {
        if (revealHistory[i]!.t <= lookback) {
          recent = revealHistory[i]!.idx;
          break;
        }
      }
      const boundary = recent > 0 ? safeBlockBoundary(displayed, recent) : 0;
      if (boundary < mem.prefixUpTo) {
        // Text shrank / message replaced under the same key: drop the cache.
        mem.prefixUpTo = 0;
        mem.prefixHtml = "";
        mem.occ.clear();
      } else if (boundary > mem.prefixUpTo) {
        // Graduate the newly-static block(s) into the baked prefix. Span once
        // (forceStatic) + fold its word counts into the running occ so the
        // tail's reveal keys stay globally unique + stable.
        const grown = displayed.slice(mem.prefixUpTo, boundary);
        mem.prefixHtml += spanWrap(rawHtmlOf(grown), mem.occ, true);
        mem.prefixUpTo = boundary;
      }
      // Live tail: span-wrap fresh each frame against `now`. occ is a throwaway
      // copy seeded from the prefix counts (the tail is re-done every frame, so
      // its counts must not pollute the prefix's running map).
      const tail = displayed.slice(mem.prefixUpTo);
      const tailHtml = spanWrap(rawHtmlOf(tail), new Map(mem.occ), false);
      firstBuild = false;
      return mem.prefixHtml + tailHtml;
    } catch {
      // Boundary logic hiccup (e.g. malformed slice) → exact legacy result:
      // full re-parse + span over the whole slice, occ from scratch.
      return spanWrap(
        plain
          ? escapeHtml(displayed)
          : DOMPurify.sanitize(marked.parse(displayed, { async: false, breaks: true }) as string),
        new Map<string, number>(),
        false,
      );
    }
  });
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized via DOMPurify / escaped above -->
<div class="message-streaming" class:md={!plain} class:message-streaming--plain={plain}>{@html html}</div>

<style>
  /* Block + per-word styles intentionally live in styles/app.css so the
     `[data-stream-fx]` tokens on <html> can target the `.sw` spans (scoped
     Svelte styles can't reach a global ancestor selector). */
</style>
