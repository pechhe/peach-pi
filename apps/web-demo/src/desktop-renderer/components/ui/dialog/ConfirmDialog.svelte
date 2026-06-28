<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import { clickCopy } from "../../../lib/code-copy";

  let {
    open = $bindable(false),
    title,
    description = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    error = "",
    busy = false,
    dontShowAgainLabel = "",
    onConfirm,
  }: {
    open?: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    /** Set to show an error inside the dialog (keeps it open). */
    error?: string;
    busy?: boolean;
    /** When set, renders a "don't warn me again" checkbox with this label. */
    dontShowAgainLabel?: string;
    /** When `dontShowAgainLabel` is set: called with the checkbox's value on
     *  confirm (true = suppress future warnings). Never called on cancel. */
    onConfirm: (dontShowAgain?: boolean) => void;
  } = $props();

  let dontShowAgain = $state(false);
  $effect(() => {
    // Reset the checkbox whenever the dialog opens so a past dismissal state
    // never leaks into a future independent confirmation.
    if (open) dontShowAgain = false;
  });
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <AlertDialog.Content
      class="fixed top-1/2 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)"
      data-testid="confirm-dialog"
    >
      <AlertDialog.Title class="text-sm font-semibold text-fg">{title}</AlertDialog.Title>
      {#if description}
        <AlertDialog.Description class="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-soft">
          {description}
        </AlertDialog.Description>
      {/if}
      {#if error}
        <p class="mt-3 rounded-lg border border-danger-border/50 bg-danger-surface/20 px-3 py-2 text-[12px] text-danger" use:clickCopy={error}>
          {error}
        </p>
      {/if}
      {#if dontShowAgainLabel}
        <label class="mt-3 flex items-center gap-2 text-[12px] text-fg-soft">
          <input type="checkbox" bind:checked={dontShowAgain} data-testid="confirm-dialog-dont-show-again" />
          {dontShowAgainLabel}
        </label>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2"
          disabled={busy}
        >
          {cancelLabel}
        </AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={() => onConfirm(dontShowAgainLabel ? dontShowAgain : undefined)}
          disabled={busy}
          data-testid="confirm-dialog-action"
          class="rounded-lg border px-3 py-1.5 text-[13px] font-medium disabled:opacity-50
            {destructive
            ? 'border-danger-border/60 bg-danger-surface/50 text-danger hover:bg-danger-surface/80'
            : 'border-border-strong bg-surface-2 text-fg hover:bg-surface-3'}"
        >
          {busy ? "…" : confirmLabel}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
