<script lang="ts">
  /**
   * Floating recorder bar. Visible whenever status !== "idle". Shows live
   * elapsed time + event count, with Stop / Cancel controls and a post-stop
   * skill-path reveal. Click-through-irrelevant (it's a real control surface).
   */
  import { recording } from "../stores/recording.svelte";
  import Circle from "@lucide/svelte/icons/circle";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import FileText from "@lucide/svelte/icons/file-text";

  let justStopped = $state(false);
  let lastSkillPath = $state<string | null>(null);

  function fmt(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function onStop() {
    // No skill body here — the agent authors it from the digest in chat.
    const res = await recording.stop();
    lastSkillPath = res.skillPath;
    justStopped = true;
  }

  function reveal() {
    if (lastSkillPath) recording.revealSkill(lastSkillPath);
  }
</script>

{#if recording.state.status !== "idle" || justStopped}
  <div
    class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs shadow-lg"
    role="status"
    data-testid="recording-bar"
  >
    {#if recording.state.status === "recording"}
      <Circle class="h-3 w-3 animate-pulse fill-red-500 text-red-500" />
      <span class="font-mono tabular-nums text-fg-soft">REC {fmt(recording.elapsed)}</span>
      <span class="text-faint">·</span>
      <span class="tabular-nums text-faint">{recording.state.eventCount} events</span>
      <button
        class="ml-1 flex items-center gap-1 rounded-full bg-fg px-2 py-0.5 text-[11px] text-bg hover:opacity-90"
        onclick={onStop}
      >
        <Square class="h-3 w-3 fill-current" /> Stop
      </button>
      <button
        class="flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-faint hover:text-fg-soft"
        onclick={() => recording.cancel()}
      >
        <X class="h-3 w-3" /> Cancel
      </button>
    {:else if recording.state.status === "error"}
      <Circle class="h-3 w-3 fill-amber-500 text-amber-500" />
      <span class="text-amber-600">{recording.state.message ?? "Recorder error"}</span>
      <button
        class="ml-1 text-[11px] text-faint underline hover:text-fg-soft"
        onclick={() => recording.start()}
      >Retry</button>
    {:else if justStopped}
      {#if lastSkillPath}
        <FileText class="h-3 w-3 text-emerald-500" />
        <span class="text-fg-soft">Skill saved.</span>
        <button class="text-[11px] text-faint underline hover:text-fg-soft" onclick={reveal}>
          Reveal file
        </button>
      {:else}
        <span class="text-fg-soft">Stopped. Ask the agent to synthesize the skill.</span>
      {/if}
      <button
        class="ml-1 text-[11px] text-faint hover:text-fg-soft"
        onclick={() => (justStopped = false)}
      >dismiss</button>
    {/if}
  </div>
{/if}
