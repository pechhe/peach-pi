<script lang="ts">
  /**
   * Floating clip-recorder bar. Visible whenever status !== "idle". Shows live
   * elapsed time + frame count, with Stop / Cancel controls and a post-stop
   * reveal of the saved clip directory. Sits above RecordingBar so the two
   * recorders don't overlap if both are ever active.
   */
  import { clip } from "../stores/clip.svelte";
  import Circle from "@lucide/svelte/icons/circle";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import Film from "@lucide/svelte/icons/film";

  let justStopped = $state(false);
  let lastClipDir = $state<string | null>(null);

  function fmt(secs: number): string {
    const m = Math.floor(secs / 60);
    return `${m}:${String(secs % 60).padStart(2, "0")}`;
  }

  async function onStop() {
    const res = await clip.stop();
    lastClipDir = res.clipDir;
    justStopped = true;
  }

  function reveal() {
    if (lastClipDir) clip.reveal(lastClipDir);
  }

  let errorDismissed = $state(false);
  let errorTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (clip.state.status === "error" && clip.state.message) {
      errorDismissed = false;
      errorTimer = setTimeout(() => (errorDismissed = true), 6000);
      return () => {
        if (errorTimer) clearTimeout(errorTimer);
      };
    }
  });
</script>

{#if clip.state.status !== "idle" || justStopped}
  <div
    class="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs shadow-lg"
    role="status"
    data-testid="clip-bar"
  >
    {#if clip.state.status === "recording"}
      <Film class="h-3 w-3 animate-pulse text-sky-500" />
      <span class="font-mono tabular-nums text-fg-soft">CLIP {fmt(clip.elapsed)}</span>
      <span class="text-faint">·</span>
      <span class="tabular-nums text-faint">{clip.state.frameCount} frames</span>
      <button
        class="ml-1 flex items-center gap-1 rounded-full bg-fg px-2 py-0.5 text-[11px] text-bg hover:opacity-90"
        onclick={onStop}
      >
        <Square class="h-3 w-3 fill-current" /> Stop
      </button>
      <button
        class="flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-faint hover:text-fg-soft"
        onclick={() => clip.cancel()}
      >
        <X class="h-3 w-3" /> Cancel
      </button>
    {:else if clip.state.status === "error" && !errorDismissed}
      <Circle class="h-3 w-3 fill-amber-500 text-amber-500" />
      <span class="text-amber-600">{clip.state.message ?? "Clip recorder error"}</span>
      <button
        class="ml-1 text-[11px] text-faint underline hover:text-fg-soft"
        onclick={() => clip.start()}
      >Retry</button>
      <button
        class="text-faint hover:text-fg-soft"
        aria-label="Dismiss"
        onclick={() => (errorDismissed = true)}
      ><X class="h-3 w-3" /></button>
    {:else if justStopped}
      <Film class="h-3 w-3 text-emerald-500" />
      <span class="text-fg-soft">Clip saved.</span>
      <button class="text-[11px] text-faint underline hover:text-fg-soft" onclick={reveal}>
        Reveal
      </button>
      <button
        class="ml-1 text-[11px] text-faint hover:text-fg-soft"
        onclick={() => (justStopped = false)}
      >dismiss</button>
    {/if}
  </div>
{/if}
