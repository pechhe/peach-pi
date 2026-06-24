<script lang="ts">
  /**
   * Appearance Playroom — a live, isolated stage for tuning how the app looks
   * and feels. It does NOT mount the real ThreadView / Composer (those are
   * IPC-coupled singletons). Instead it drives a local message model through
   * the real renderer-only animation primitives:
   *   - message-in     → `.item-enter` + the real `StreamingText` reveal
   *   - done animation  → the real `DoneBurst` + a card pop
   *   - toasts / alerts → the real `extensionUi` store (surfaced by the global
   *                       <Toasts>) + the real banner colour classes
   *   - chassis / colors → the real `.composer-device` chrome + theme tokens
   *
   * All appearance settings live in the right rail so changes are felt live.
   */
  import { tick } from "svelte";
  import StreamingText from "./StreamingText.svelte";
  import DoneBurst from "./DoneBurst.svelte";
  import ThemeControls from "./ThemeControls.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { doneAnim, type DoneAnimId } from "../lib/done-anim.svelte";
  import {
    STREAM_LOOKS,
    STREAM_SPEEDS,
    streamReveal,
    type StreamLook,
    type StreamSpeed,
  } from "../lib/stream-reveal.svelte";
  import { theme, type ComposerStyle } from "../lib/theme.svelte";
  import { Select } from "../components/ui/select";
  import Send from "@lucide/svelte/icons/send";
  import Check from "@lucide/svelte/icons/check";
  import Info from "@lucide/svelte/icons/info";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import "../styles/done-anim-burst.css";

  type Role = "user" | "assistant";
  interface Msg {
    id: number;
    role: Role;
    text: string;
    /** Assistant only: drives the StreamingText typewriter reveal. */
    streaming?: boolean;
  }

  let seq = 0;
  let messages = $state<Msg[]>([
    { id: ++seq, role: "user", text: "Show me how a reply streams in." },
    {
      id: ++seq,
      role: "assistant",
      text: "Sure — this text reveals through the **real** streaming engine, so your\nchosen *look* and *speed* apply live. Edit a colour on the right and the\nwhole stage repaints instantly.",
      streaming: false,
    },
  ]);

  let input = $state("");
  let scroller = $state<HTMLElement | null>(null);

  const CANNED = [
    "Got it. Here's a reply so you can watch the reveal land — links like [docs](#) pick up your accent.",
    "On it. Surfaces and borders derive from your background; this bubble shows the muted text shade.",
    "Done. Try switching the composer chassis or the streaming look to feel the difference.",
  ];
  let cannedIdx = 0;

  async function scrollToBottom() {
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    input = "";
    messages = [...messages, { id: ++seq, role: "user", text }];
    await scrollToBottom();
    // Assistant reply streams in via the real StreamingText engine.
    const reply = CANNED[cannedIdx % CANNED.length] ?? "";
    cannedIdx++;
    const id = ++seq;
    messages = [...messages, { id, role: "assistant", text: reply, streaming: true }];
    await scrollToBottom();
    // Mark non-streaming once the typewriter would have caught up, so the
    // "working" affordance settles (purely cosmetic here).
    setTimeout(() => {
      messages = messages.map((m) => (m.id === id ? { ...m, streaming: false } : m));
    }, 2400);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── "Mark done" demo ──────────────────────────────────────────────
  // A dummy thread row that pops + bursts when completed, mirroring the
  // sidebar's finish-archive flow. Reappears after the burst so it can be
  // replayed.
  let doneBursting = $state(false);
  let donePopping = $state(false);

  function markDone() {
    if (doneBursting) return;
    donePopping = false;
    doneBursting = true;
    requestAnimationFrame(() => {
      donePopping = true;
      setTimeout(() => (donePopping = false), 700);
    });
  }

  // ── Toast / alert triggers ────────────────────────────────────────
  function toast(level: "info" | "warning" | "error") {
    const msg = {
      info: "Heads up — this is an informational notice.",
      warning: "Warning: something needs your attention.",
      error: "Error: that action could not be completed.",
    }[level];
    extensionUi.notify(msg, undefined, level);
  }

  function toastWithAction() {
    extensionUi.notify(
      "Thread archived.",
      { label: "Undo", run: () => extensionUi.notify("Restored.", undefined, "info") },
      "info",
    );
  }
</script>

<main class="flex h-full flex-1" data-testid="playroom-view">
  <!-- ── Stage ─────────────────────────────────────────────────────── -->
  <section class="flex min-w-0 flex-1 flex-col">
    <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
      <h1 class="text-sm font-medium text-fg-soft">Appearance Playroom</h1>
      <span class="ml-3 text-xs text-fainter">Live stage — send messages, mark done, fire alerts.</span>
    </header>

    <!-- Thread surface -->
    <div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div class="mx-auto flex max-w-2xl flex-col gap-4">
        {#each messages as m (m.id)}
          {#if m.role === "user"}
            <div class="item-enter flex justify-end">
              <div class="max-w-[80%] rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg">
                {m.text}
              </div>
            </div>
          {:else}
            <div class="item-enter assistant-message text-[13.5px] leading-relaxed text-fg">
              <StreamingText text={m.text} streaming={m.streaming ?? false} revealKey={`play-${m.id}`} />
            </div>
          {/if}
        {/each}

        <!-- Mark-done demo row -->
        <div class="relative mt-2 flex items-center gap-3 self-start rounded-lg border border-border bg-surface/60 px-3 py-2">
          <span
            class="mock-row flex items-center gap-2 text-[13px] text-fg"
            class:popping={donePopping}
            class:pop--popSpark={donePopping && doneAnim.current === "popSpark"}
            class:pop--stamp={donePopping && doneAnim.current === "stamp"}
            class:pop--confetti={donePopping && doneAnim.current === "confetti"}
            class:pop--twos={donePopping && doneAnim.current === "twos"}
            class:pop--spring={donePopping && doneAnim.current === "spring"}
          >
            <Check size={14} class="text-accent" /> Dummy thread
          </span>
          {#if doneBursting}
            <div class="pointer-events-none absolute left-[5.5rem] top-1/2 -translate-y-1/2">
              <DoneBurst ondone={() => (doneBursting = false)} />
            </div>
          {/if}
          <button
            class="ml-2 rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg transition-colors hover:border-border-focus"
            onclick={markDone}
            data-testid="playroom-mark-done"
          >Mark done</button>
        </div>
      </div>
    </div>

    <!-- Composer device (real chassis chrome) -->
    <footer class="composer-device shrink-0 px-6 pb-6">
      <div class="composer__frame relative">
        <div class="composer__surface">
          <div class="composer__editor">
            <div class="composer__screen">
              <textarea
                bind:value={input}
                onkeydown={onKeydown}
                rows="2"
                placeholder="message the clanker…"
                class="w-full resize-none bg-transparent outline-none"
                data-testid="playroom-input"
                aria-label="Playroom message"
              ></textarea>
            </div>
          </div>
        </div>
        <button
          class="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg disabled:opacity-40"
          onclick={send}
          disabled={!input.trim()}
          data-testid="playroom-send"
        ><Send size={13} /> Send</button>
      </div>
    </footer>
  </section>

  <!-- ── Controls rail ─────────────────────────────────────────────── -->
  <aside class="w-[360px] shrink-0 overflow-y-auto border-l border-border bg-surface/30 p-4">
    <div class="flex flex-col gap-5">
      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <ThemeControls />
      </section>

      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <h2 class="mb-3 text-sm text-fg">Motion &amp; chassis</h2>
        <div class="flex flex-col gap-3">
          <label class="flex items-center justify-between gap-3 text-xs text-muted">
            Composer
            <Select
              class="rounded-md bg-surface-2"
              value={theme.composer}
              onValueChange={(v) => theme.setComposer(v as ComposerStyle)}
              items={theme.composerOptions.map((o) => ({ value: o.id, label: o.label }))}
              aria-label="Composer appearance"
            />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs text-muted">
            Done animation
            <Select
              class="rounded-md bg-surface-2"
              value={doneAnim.current}
              onValueChange={(v) => doneAnim.set(v as DoneAnimId)}
              items={[
                { value: "popSpark", label: "Pop & sparkle" },
                { value: "stamp", label: "Approval stamp" },
                { value: "confetti", label: "Confetti" },
                { value: "twos", label: "Full on-twos" },
                { value: "spring", label: "Springy ring" },
              ]}
              aria-label="Done animation"
            />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs text-muted">
            Streaming look
            <Select
              class="rounded-md bg-surface-2"
              value={streamReveal.look}
              onValueChange={(v) => streamReveal.setLook(v as StreamLook)}
              items={STREAM_LOOKS.map((l) => ({ value: l.id, label: l.label }))}
              aria-label="Streaming look"
            />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs text-muted">
            Streaming speed
            <Select
              class="rounded-md bg-surface-2"
              value={streamReveal.speed}
              onValueChange={(v) => streamReveal.setSpeed(v as StreamSpeed)}
              items={STREAM_SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
              aria-label="Streaming speed"
            />
          </label>
        </div>
      </section>

      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <h2 class="mb-3 text-sm text-fg">Alerts</h2>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs text-fg hover:border-border-focus" onclick={() => toast("info")}>Info toast</button>
          <button class="rounded-md border border-warning-border bg-warning-surface px-2.5 py-1 text-xs text-warning hover:opacity-80" onclick={() => toast("warning")}>Warning toast</button>
          <button class="rounded-md border border-danger-border bg-danger-surface px-2.5 py-1 text-xs text-danger hover:opacity-80" onclick={() => toast("error")}>Error toast</button>
          <button class="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs text-fg hover:border-border-focus" onclick={toastWithAction}>Toast + Undo</button>
        </div>

        <!-- Inline banner samples (the three alert kinds, static) -->
        <div class="mt-3 flex flex-col gap-2">
          <p class="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs text-fg"><Info class="size-4 shrink-0 opacity-80" /> Informational banner.</p>
          <p class="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-surface px-3 py-1.5 text-xs text-warning"><TriangleAlert class="size-4 shrink-0 opacity-80" /> Warning banner.</p>
          <p class="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-1.5 text-xs text-danger"><CircleX class="size-4 shrink-0 opacity-80" /> Error banner.</p>
        </div>
      </section>
    </div>
  </aside>
</main>

<style>
  /* Card pop for the mark-done demo row. Mirrors the sidebar's done-pop
     keyframes (kept local, same pattern as DoneBurstPlayground). */
  .mock-row { transform-origin: center; }
  .popping.pop--popSpark { animation: play-pop-spark 420ms steps(1, jump-end); }
  .popping.pop--twos { animation: play-pop-spark 420ms steps(1, jump-end); }
  .popping.pop--stamp { animation: play-pop-stamp 380ms steps(1, jump-end); }
  .popping.pop--confetti { animation: play-pop-confetti 460ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .popping.pop--spring { animation: play-pop-spring 620ms cubic-bezier(0.5, 1.4, 0.5, 1); }

  @keyframes play-pop-spark {
    0% { transform: scale(1) rotate(0); }
    15% { transform: scale(0.92) rotate(0); }
    35% { transform: scale(1.08) rotate(-2deg); }
    55% { transform: scale(0.97) rotate(1.5deg); }
    75% { transform: scale(1.03) rotate(-0.5deg); }
    100% { transform: scale(1) rotate(0); }
  }
  @keyframes play-pop-stamp {
    0% { transform: scale(1.3) rotate(-4deg); }
    35% { transform: scale(0.9) rotate(1deg); }
    60% { transform: scale(1.06) rotate(-1deg); }
    100% { transform: scale(1) rotate(0); }
  }
  @keyframes play-pop-confetti {
    0% { transform: scale(1); }
    40% { transform: scale(1.12); }
    70% { transform: scale(0.97); }
    100% { transform: scale(1); }
  }
  @keyframes play-pop-spring {
    0% { transform: scale(1); }
    25% { transform: scale(1.1); }
    45% { transform: scale(0.96); }
    65% { transform: scale(1.04); }
    82% { transform: scale(0.99); }
    100% { transform: scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .mock-row { animation: none !important; }
  }
</style>
