<script lang="ts">
  // Floating "BTW" cap for the side conversation (/btw). Extracted from
  // Composer.svelte (issue #55). Portaled to <body> so `position: fixed`
  // resolves against the viewport; the down/up click sound spacing and the
  // open-vs-send (when the panel is already open for this thread) branch stay
  // here, matching the inline behaviour.
  import type { Thread } from "@peach-pi/shared-types";
  import { pressClick } from "../../lib/sound/button-click-sound";
  import { sideChat } from "../../stores/side-chat.svelte";
  import { captureEvent } from "../../lib/telemetry";

  let {
    thread,
    centered = false,
  }: {
    thread: Thread;
    centered?: boolean;
  } = $props();

  let btwRelease: (() => void) | null = null;

  // Move the floating BTW cap to <body> so `position: fixed` resolves against
  // the viewport (the composer/card ancestors create a containing block that
  // otherwise drags it left when the /btw panel docks in).
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

{#if !centered}
  <div class="composer-device" use:portal>
    <button
      class="btw-btn btw-btn--floating"
      data-press="self"
      data-has-input={sideChat.open &&
        sideChat.threadId === thread.id &&
        sideChat.draft.trim() &&
        !sideChat.streaming
        ? ""
        : undefined}
      onpointerdown={(e) => {
        if (e.button !== 0) return;
        btwRelease = pressClick();
      }}
      onpointerup={(e) => {
        if (e.button !== 0) return;
        btwRelease?.();
        btwRelease = null;
        // Open the panel, or — when it's already open for this thread — act as its
        // send button. (Close via the panel's ×.)
        const panelOpen = sideChat.open && sideChat.threadId === thread.id;
        if (panelOpen) { void sideChat.submitDraft(); } else { captureEvent("side_chat_opened"); void sideChat.openPanel(thread.id); }
      }}
      onpointercancel={() => { btwRelease = null; }}
      data-testid="open-side-chat"
      title="Side conversation (/btw) — ask a quick question without touching this task"
      aria-label="Open side conversation"
    >
      <span class="btw-btn__label">BTW</span>
    </button>
  </div>
{/if}
