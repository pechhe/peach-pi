<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { recording } from "../../stores/recording.svelte";
  import Composer from "../../app/Composer.svelte";
  import Circle from "@lucide/svelte/icons/circle";

  let {
    thread,
    isEmpty,
    onRewind,
    onNewThread,
    onCloneThread,
    onForkPicker,
    onSetEnvironment,
  }: {
    thread: Thread;
    isEmpty: boolean;
    onRewind: (n: number) => void;
    onNewThread?: () => void;
    onCloneThread: () => void | Promise<void>;
    onForkPicker: () => void;
    onSetEnvironment?: (threadId: string, worktree: boolean) => void | Promise<void>;
  } = $props();

  // ── Environment toggle (Local ⇄ Worktree) ──────────────────────────
  // The real flip (git worktree add/remove + session respawn) takes a beat,
  // and the button label only reflects `thread.worktreeDir` after the snapshot
  // refreshes. Optimistically flip the label on click, keyed to this thread id,
  // and let the snapshot catch up — reverting if the IPC call rejects.
  let envOverride = $state<{ id: string; worktree: boolean } | null>(null);
  const isWorktree = $derived(
    envOverride && envOverride.id === thread.id
      ? envOverride.worktree
      : thread.worktreeDir != null,
  );
  $effect(() => {
    if (
      envOverride &&
      envOverride.id === thread.id &&
      (thread.worktreeDir != null) === envOverride.worktree
    ) {
      envOverride = null;
    }
  });
  async function toggleEnvironment() {
    const target = !isWorktree;
    envOverride = { id: thread.id, worktree: target };
    try {
      await onSetEnvironment?.(thread.id, target);
    } catch {
      envOverride = null; // revert label on failure
    }
  }

  // ── Composer docking (FLIP) ─────────────────────────────────────────
  // The composer node is shared between the centred new-thread state and the
  // bottom-docked state. When the first message promotes the thread, FLIP the
  // composer from its old (centred) box down to its new (docked) box so it
  // glides into place. Only a genuinely-new thread (still placeholder title)
  // can trip isEmpty true→false, so resumed threads never animate.
  let dockEl = $state<HTMLElement | null>(null);
  let dockFirstTop = 0;
  let prevEmpty: boolean | undefined;
  $effect.pre(() => {
    const empty = isEmpty;
    if (prevEmpty === true && !empty && dockEl) {
      dockFirstTop = dockEl.getBoundingClientRect().top;
    }
  });
  $effect(() => {
    const empty = isEmpty;
    if (prevEmpty === true && !empty && dockEl) {
      const dy = dockFirstTop - dockEl.getBoundingClientRect().top;
      if (dy !== 0) {
        dockEl.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          // Sharp launch, extended decaying tail.
          { duration: 1600, easing: "cubic-bezier(0.04, 0.9, 0.02, 1)" },
        );
      }
    }
    prevEmpty = empty;
  });
</script>

<div bind:this={dockEl} class="composer-dock" class:composer-dock--centered={isEmpty}>
  {#if isEmpty && thread.projectId}
    <div class="composer-device new-thread__bar">
      <button
        type="button"
        class="new-thread__environment"
        aria-pressed={isWorktree}
        onmousedown={(e) => e.preventDefault()}
        onclick={toggleEnvironment}
        data-testid="environment-toggle"
        data-press="rotary"
        title={isWorktree
          ? "Working in an isolated git worktree (seeded from a copy of your main checkout's changes)"
          : "Working in the project directory — switching to Worktree seeds it from a copy of your current changes, main is left untouched"}
      >
        {isWorktree ? "⎇ Worktree" : "◈ Local"}
      </button>
      <button
        type="button"
        class="new-thread__record"
        onclick={() => recording.start(thread.id)}
        data-testid="start-recording"
        title="Record a desktop task → synthesize a skill in this chat"
        aria-label="Start recording"
      >
        <Circle size={11} class="fill-red-500 text-red-500" />
        <span>Record</span>
      </button>
    </div>
  {/if}
  <Composer
    {thread}
    {onRewind}
    {onNewThread}
    onCloneThread={onCloneThread}
    onForkPicker={onForkPicker}
    centered={isEmpty}
  />
</div>

<style>
  /* The composer normally sits at the bottom of the column. While composing a
     brand-new thread the transcript is hidden, so margin-block:auto centres
     the composer (and its environment toggle) vertically. The draft→real
     promotion keeps this same node, so the FLIP transform docks it down. */
  .composer-dock {
    flex-shrink: 0;
    will-change: transform;
  }
  .composer-dock--centered {
    margin-block: auto;
  }
  .new-thread__bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
  }
  .new-thread__record {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    font-size: 11px;
    font-weight: 500;
    color: var(--color-faint);
    border: 1px solid var(--color-border-strong);
    border-radius: 0.375rem;
    background: var(--color-surface);
    transition: color 120ms ease, background 120ms ease;
  }
  .new-thread__record:hover {
    background: var(--color-surface-2);
    color: var(--color-fg);
  }
</style>
