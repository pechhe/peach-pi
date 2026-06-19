<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import Undo2 from "@lucide/svelte/icons/undo-2";

  let {
    open = $bindable(false),
    revertFiles = $bindable(true),
    canRevert,
    turnCount,
    promptPreview,
    onConfirm,
  }: {
    open?: boolean;
    revertFiles?: boolean;
    canRevert: boolean;
    /** How many turns will drop out of the active conversation. */
    turnCount: number;
    /** The prompt that returns to the composer after rewinding. */
    promptPreview: string;
    onConfirm: () => void;
  } = $props();
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <AlertDialog.Content
      class="fixed top-1/2 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)"
      data-testid="rewind-dialog"
    >
      <div class="flex items-start gap-3">
        <span class="mt-0.5 shrink-0 text-danger"><Undo2 size={18} /></span>
        <div class="min-w-0">
          <AlertDialog.Title class="text-sm font-semibold text-fg">
            {turnCount <= 1 ? "Rewind this turn?" : `Rewind the last ${turnCount} turns?`}
          </AlertDialog.Title>
          <AlertDialog.Description class="mt-1.5 text-[13px] leading-relaxed text-fg-soft">
            This removes {turnCount <= 1 ? "this turn" : `these ${turnCount} turns`} from the active
            conversation. pi keeps the full history, but you can't fast-forward back to
            {turnCount <= 1 ? "it" : "them"} afterwards.
          </AlertDialog.Description>
        </div>
      </div>

      {#if promptPreview}
        <div class="mt-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2">
          <p class="text-[10px] font-medium uppercase tracking-wide text-fainter">Returns to composer</p>
          <p class="mt-0.5 line-clamp-3 text-[13px] text-fg-soft whitespace-pre-wrap">{promptPreview}</p>
        </div>
      {/if}

      {#if canRevert}
        <label
          class="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-danger-border/40 bg-danger-surface/20 px-3 py-2"
        >
          <input type="checkbox" class="mt-0.5 accent-danger" bind:checked={revertFiles} data-testid="rewind-revert" />
          <span class="text-[13px] text-fg-soft">
            <span class="font-medium text-fg">Revert file changes</span> made during
            {turnCount <= 1 ? "this turn" : "these turns"}.
            <span class="text-faint">Restores the working tree to its earlier state and permanently
            discards later changes, including new files — this can't be undone.</span>
          </span>
        </label>
      {/if}

      <div class="mt-4 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2"
        >
          Cancel
        </AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={onConfirm}
          data-testid="rewind-confirm"
          class="rounded-lg border border-danger-border/60 bg-danger-surface/50 px-3 py-1.5 text-[13px] font-medium text-danger hover:bg-danger-surface/80"
        >
          {canRevert && revertFiles ? "Rewind & revert files" : "Rewind"}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
