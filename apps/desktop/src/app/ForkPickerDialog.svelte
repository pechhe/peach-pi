<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import GitBranch from "@lucide/svelte/icons/git-branch";

  let {
    open = $bindable(false),
    turns,
    onPick,
  }: {
    open?: boolean;
    turns: { entryId: string; text: string }[];
    onPick: (entryId: string) => void;
  } = $props();

  let selected = $state<string | null>(null);
  let scrollEl: HTMLDivElement | null = $state(null);

  // Selection is a cutoff, not a point: picking turn N highlights turns 1..N
  // (oldest→selected). Bottom = everything; moving up strips newer ones from
  // the highlight. The selected turn is the fork point — the new thread keeps
  // everything before it and prefills its composer with this turn's prompt.
  const selectedIndex = $derived(selected ? turns.findIndex((t) => t.entryId === selected) : -1);
  const inRange = (i: number) => selectedIndex >= 0 && i <= selectedIndex;

  function confirm() {
    if (!selected) return;
    const id = selected;
    selected = null;
    open = false;
    onPick(id);
  }

  // Reset selection to the newest turn and snap to the bottom whenever the
  // picker reopens (newest sits at the bottom; scroll up for older turns).
  $effect(() => {
    if (open) {
      selected = turns.at(-1)?.entryId ?? null;
      // Defer until the list has rendered with the new turns.
      queueMicrotask(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    }
  });
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <AlertDialog.Content
      class="fixed top-1/2 z-50 flex max-h-[70vh] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)"
      data-testid="fork-picker"
    >
      <div class="flex items-start gap-3">
        <span class="mt-0.5 shrink-0 text-accent"><GitBranch size={18} /></span>
        <div class="min-w-0">
          <AlertDialog.Title class="text-sm font-semibold text-fg">
            Fork into a new thread
          </AlertDialog.Title>
          <AlertDialog.Description class="mt-1 text-[13px] leading-relaxed text-fg-soft">
            Pick how far back to fork. Everything up to and including the marked turn
            becomes the new thread's starting context; its prompt is copied to the
            composer so you can rework it before sending.
          </AlertDialog.Description>
        </div>
      </div>

      <div bind:this={scrollEl} class="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-2/30">
        {#if turns.length === 0}
          <p class="px-3 py-6 text-center text-[13px] text-faint">
            No turns to fork from yet.
          </p>
        {:else}
          <ul class="divide-y divide-border/60">
            {#each turns as turn, i (turn.entryId)}
              <li>
                <button
                  type="button"
                  class="fork-row flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-2/60"
                  class:in-range={inRange(i)}
                  class:fork-head={selected === turn.entryId}
                  onclick={() => (selected = turn.entryId)}
                  data-testid="fork-picker-turn"
                >
                  <span
                    class="mt-1 h-3 w-3 shrink-0 rounded-full border border-border-strong {inRange(i)
                      ? 'bg-accent border-accent'
                      : 'bg-transparent'}"
                  ></span>
                  <span class="min-w-0 line-clamp-2 text-[13px] {inRange(i) ? 'text-fg' : 'text-fg-soft'} whitespace-pre-wrap break-words">
                    {turn.text || "(empty)"}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2"
        >
          Cancel
        </AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={confirm}
          disabled={!selected}
          data-testid="fork-picker-confirm"
          class="rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40 disabled:hover:bg-accent/10"
        >
          Fork here
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .fork-row.in-range {
    background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  }
  .fork-row.fork-head {
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    box-shadow: inset 0 -1px 0 var(--color-accent);
  }
</style>
