<script lang="ts">
  import {
    routeFinishCue,
    resolveHudTarget,
    type Thread,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { snapshot } from "../stores/snapshot.svelte";
  import { transcripts } from "../stores/transcripts.svelte";
  import { queues } from "../stores/composer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { autoCompact } from "../stores/auto-compact.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { playDoneSound } from "../lib/sound/done-sound";
  import Composer from "./Composer.svelte";
  import Markdown from "./Markdown.svelte";
  import MessageBadges from "./MessageBadges.svelte";

  // Reveal state.
  let expanded = $state(false);
  let pinned = $state(false);
  let hovering = $state(false);
  // Ambient finish cue: pulse + optional "done" badge (own thread or other).
  let pulsing = $state(false);
  let doneBadge = $state<{ threadId: string; other: boolean } | null>(null);

  let expandTimer: ReturnType<typeof setTimeout> | null = null;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;

  // Holding ⌘ while the composer isn't focused fades the HUD to see behind it.
  let dimmed = $state(false);
  let dimTimer: ReturnType<typeof setTimeout> | null = null;

  // Measured composer chassis top (px from the window bottom) so the card tucks
  // flush behind it with no gap, independent of the device's scale.
  let chassisTop = $state(210);

  let scrollEl = $state<HTMLElement | null>(null);

  // Immediate pointer-over (composer device or card) — drives click-through.
  let overInteractive = $state(false);

  // Stores the real Composer depends on (same as App.svelte mounts).
  snapshot.init();
  transcripts.init();
  queues.init();
  sessionMetas.init();
  extensionUi.init();
  void autoCompact.load();

  // The HUD's own active thread (independent of the Main Window selection).
  const hudThreadId = $derived(snapshot.current?.ui.hudThreadId ?? null);
  const target = $derived.by((): Thread | null => {
    const id = resolveHudTarget(hudThreadId, snapshot.current?.threads.map((t) => t.id) ?? []);
    return (id && snapshot.current?.threads.find((t) => t.id === id)) || null;
  });
  const items = $derived(hudThreadId ? transcripts.itemsFor(hudThreadId) : []);

  $effect(() => {
    if (hudThreadId) void transcripts.ensure(hudThreadId);
  });

  // Measure where the composer's chassis top sits, to anchor the card flush.
  $effect(() => {
    if (!target) return;
    const raf = requestAnimationFrame(() => {
      const frame = document.querySelector(".composer__frame");
      if (frame) chassisTop = Math.round(window.innerHeight - frame.getBoundingClientRect().top);
    });
    return () => cancelAnimationFrame(raf);
  });

  // Grow the window immediately when opening; delay the shrink so the card
  // finishes sliding back in before the window clips it.
  $effect(() => {
    if (expanded) {
      void api.invoke("hud:setExpanded", true);
      return;
    }
    const t = setTimeout(() => void api.invoke("hud:setExpanded", false), 300);
    return () => clearTimeout(t);
  });

  // Open at the very bottom (latest messages), and stay pinned there while open.
  $effect(() => {
    void items.length;
    if (expanded && scrollEl)
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
  });

  function clearTimers() {
    if (expandTimer) clearTimeout(expandTimer);
    if (collapseTimer) clearTimeout(collapseTimer);
    expandTimer = collapseTimer = null;
  }

  function onEnter() {
    hovering = true;
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    if (pinned || expanded || expandTimer) return;
    // Hover peeks up immediately (CSS); pops out fully after a short hold.
    expandTimer = setTimeout(() => {
      expanded = true;
      expandTimer = null;
    }, 450);
  }

  function onLeave() {
    hovering = false;
    // Mouse left the composer/card → drop input focus immediately.
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (expandTimer) {
      clearTimeout(expandTimer);
      expandTimer = null;
    }
    if (pinned) return;
    collapseTimer = setTimeout(() => {
      expanded = false;
      collapseTimer = null;
    }, 260);
  }

  function pinOpen() {
    clearTimers();
    if (doneBadge?.other) void api.invoke("hud:setThread", doneBadge.threadId);
    doneBadge = null;
    pinned = true;
    expanded = true;
  }

  function collapseToPeek() {
    clearTimers();
    pinned = false;
    expanded = false;
  }

  // Ambient finish cue (HUD up): pulse + done sound + badge / opt-in expand.
  api.on("event:hudFinish", ({ threadId }) => {
    const snap = snapshot.current;
    if (!snap) return;
    const cue = routeFinishCue({
      finishedThreadId: threadId,
      hudThreadId,
      hudVisible: true,
      autoRevealOnFinish: snap.ui.hudAutoRevealOnFinish,
    });
    if (cue.kind === "none") return;
    playDoneSound();
    pulsing = true;
    setTimeout(() => (pulsing = false), 1200);
    if (cue.kind === "expand") {
      pinned = true;
      expanded = true;
    } else if (cue.kind === "badge-other") {
      doneBadge = { threadId: cue.threadId, other: true };
    } else {
      doneBadge = { threadId, other: false };
    }
  });

  function cancelDim() {
    if (dimTimer) {
      clearTimeout(dimTimer);
      dimTimer = null;
    }
    dimmed = false;
  }

  // Esc collapses a pinned/expanded panel back to the peek; else hides the HUD.
  // Holding ⌘ on its own fades the HUD so you can see behind it; a ⌘+key combo
  // (an actual shortcut) cancels it.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (expanded || pinned) {
        e.preventDefault();
        e.stopPropagation();
        collapseToPeek();
      } else {
        void api.invoke("hud:hide");
      }
      return;
    }
    if (e.key === "Meta") {
      if (!dimTimer && !dimmed)
        dimTimer = setTimeout(() => {
          dimmed = true;
          dimTimer = null;
        }, 350);
      return;
    }
    cancelDim();
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.key === "Meta") cancelDim();
  }

  // Blur: a hover-peek panel collapses; a pinned panel stays open. Window stays visible.
  function onBlur() {
    cancelDim();
    if (!pinned) {
      clearTimers();
      expanded = false;
    }
  }

  // Click-through: forward clicks in the transparent gap/corners to the app behind.
  let ignoring = false;
  function onPointerMove(e: MouseEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    overInteractive = !!el?.closest(".composer-device, .hud-card");
    dimmed = e.metaKey; // follow ⌘ live (works even unfocused, via forwarded moves)
    // Peek only over the device/card, and not while ⌘-peeking through.
    if (overInteractive && !e.metaKey && !hovering) onEnter();
    else if ((!overInteractive || e.metaKey) && hovering) onLeave();
  }

  // Click through whenever ⌘ is held (see-behind) or the cursor isn't over the
  // composer/card. Reactive so a stationary ⌘ (no mouse move) still passes clicks.
  $effect(() => {
    const ignore = dimmed || !overInteractive;
    if (ignore !== ignoring) {
      ignoring = ignore;
      void api.invoke("hud:setClickThrough", ignore);
    }
  });

  // Mouse left the whole window → release HUD focus back to the app behind.
  function onDocLeave() {
    overInteractive = false;
    (document.activeElement as HTMLElement | null)?.blur?.();
    void api.invoke("hud:releaseFocus");
    if (hovering) onLeave();
  }

  $effect(() => {
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mouseleave", onDocLeave);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keyup", onKeyup, true);
    return () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mouseleave", onDocLeave);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("keyup", onKeyup, true);
    };
  });
</script>

<div
  class="hud-root relative flex h-screen flex-col justify-end text-fg"
  role="presentation"
  style:opacity={dimmed ? 0.12 : 1}
  data-testid="hud-root"
>
  <!-- The current thread, tucked flush behind the composer; pulls up on hover. -->
  <div
    class="hud-card text-fg"
    class:hud-card--peek={hovering && !expanded}
    class:hud-card--open={expanded}
    style:--chassis-top={`${chassisTop}px`}
    role="button"
    tabindex="-1"
    onclick={pinOpen}
    onkeydown={() => {}}
    data-hud-interactive
    data-testid="hud-chat"
  >
    <div class="hud-card__title">
      <span class="truncate">{target?.title || "Untitled thread"}</span>
      {#if doneBadge}<span class="hud-card__badge" data-testid="hud-done-badge"></span>{/if}
    </div>
    <div class="hud-card__scroll" bind:this={scrollEl}>
      {#if items.length === 0}
        <p class="text-faint">No messages yet.</p>
      {:else}
        {#each items as item (item.id)}
          {#if item.kind === "user"}
            <MessageBadges text={item.text} variant="hud">
              {#snippet children({ body })}
                {#if body}
                  <div class="hud-msg-user">{body}</div>
                {/if}
              {/snippet}
            </MessageBadges>
          {:else if item.kind === "assistant"}
            <div class="hud-msg"><Markdown text={item.text} /></div>
          {:else if item.kind === "tool"}
            <div class="hud-msg-meta">⚙ {item.toolName} · {item.status}</div>
          {:else if item.kind === "subagent"}
            <div class="hud-msg-meta">agents: {item.rows.map((r) => r.name).join(", ")}</div>
          {:else if item.kind === "compaction"}
            <div class="hud-msg-meta">{item.running ? "compacting…" : "context compacted"}</div>
          {:else}
            <div class="hud-msg-notice">{item.text}</div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- The real composer device, full-bleed so it matches its normal width. -->
  <div
    class="hud-composer-fade relative z-10 transition-shadow"
    class:ring-2={pulsing}
    class:ring-success={pulsing}
    style:opacity={expanded ? 0.4 : 1}
    data-hud-interactive
    data-testid="hud-composer"
  >
    {#if target}
      <Composer thread={target} />
    {:else}
      <div class="px-6 pb-6 text-sm text-faint">Starting chat…</div>
    {/if}
  </div>
</div>

<style>
  .hud-root {
    transition: opacity 220ms ease;
  }
  .hud-composer-fade {
    transition: opacity 300ms ease;
  }

  /* The card lives BEHIND the composer (z-0) and grows upward. At rest it's
     tucked flush behind the composer (`--overlap`) so only the title strip
     shows and there's no gap. Hover lifts it a touch; then it pops out fully
     as a card with a small `--gap` below it.
     `--chassis-top` is measured at runtime (composer's visual top). */
  .hud-card {
    --chassis-top: 210px;
    --title-h: 36px;
    --peek-h: 66px;
    --card-h: 360px;
    --overlap: 22px;
    --gap: 14px;
    position: absolute;
    left: 50%;
    bottom: calc(var(--chassis-top) - var(--overlap));
    width: min(720px, calc(100% - 110px));
    height: var(--title-h);
    z-index: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    /* Glassy: translucent surface over a blurred backdrop. */
    background-color: color-mix(in srgb, var(--color-bg) 70%, transparent);
    backdrop-filter: blur(22px) saturate(1.4);
    -webkit-backdrop-filter: blur(22px) saturate(1.4);
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 50%, transparent);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    transform: translate(-50%, 0);
    transition:
      height 320ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 320ms ease,
      backdrop-filter 320ms ease;
  }
  .hud-card--peek {
    height: var(--peek-h);
    transform: translate(-50%, calc(-1 * (var(--overlap) + 4px)));
  }
  /* On open the card goes fully opaque (glass → solid). */
  .hud-card--open {
    height: var(--card-h);
    transform: translate(-50%, calc(-1 * (var(--overlap) + var(--gap))));
    background-color: var(--color-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .hud-card__title {
    flex: none;
    height: var(--title-h);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--color-muted, #888);
  }
  .hud-card__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 14px 12px;
    font-size: 11.5px;
    line-height: 1.5;
  }
  /* Match the main app's message formatting, just smaller. */
  .hud-msg {
    color: var(--color-fg);
  }
  .hud-msg-user {
    align-self: flex-end;
    max-width: 85%;
    padding: 6px 10px;
    border-radius: 14px 14px 4px 14px;
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 40%, transparent);
    background: color-mix(in srgb, var(--color-surface-2) 80%, transparent);
    white-space: pre-wrap;
    color: var(--color-fg);
  }
  .hud-msg-meta {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px;
    color: var(--color-faint);
  }
  .hud-msg-notice {
    text-align: center;
    font-style: italic;
    font-size: 10.5px;
    color: var(--color-faint);
  }
  .hud-card__badge {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: #22c55e;
  }
</style>
