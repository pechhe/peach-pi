<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import { api } from "../../../lib/ipc";

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  let body = $state("");
  let busy = $state(false);
  let error = $state("");
  let successUrl = $state("");
  let closing = $state(false);

  // Reset state whenever the dialog opens so a past result never leaks in.
  $effect(() => {
    if (open) {
      body = "";
      busy = false;
      error = "";
      successUrl = "";
      closing = false;
    }
  });

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    busy = true;
    error = "";
    try {
      const res = await api.invoke("feedback:send", text);
      if (res.ok) {
        successUrl = res.url;
        closing = true;
        // Brief success flash, then close.
        setTimeout(() => {
          open = false;
        }, 1200);
      } else {
        error = res.error;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <AlertDialog.Content
      class="fixed top-1/2 z-50 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)"
      data-testid="feedback-dialog"
    >
      <AlertDialog.Title class="text-sm font-semibold text-fg">Send feedback</AlertDialog.Title>
      {#if successUrl}
        <div class="mt-3 rounded-lg border border-success-border/50 bg-success-surface/20 px-3 py-2 text-[12px] text-success">
          Sent. <a href={successUrl} target="_blank" rel="noreferrer" class="underline">View issue →</a>
        </div>
      {:else}
        <textarea
          bind:value={body}
          rows={5}
          placeholder="Describe your feedback…"
          data-testid="feedback-input"
          class="mt-3 w-full rounded-lg border border-border bg-surface-2 p-3 text-[13px] text-fg placeholder:text-fainter focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        ></textarea>
      {/if}
      {#if error}
        <p class="mt-2 rounded-lg border border-danger-border/50 bg-danger-surface/20 px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2"
          disabled={busy}
        >
          {closing ? "Close" : "Cancel"}
        </AlertDialog.Cancel>
        {#if !successUrl}
          <AlertDialog.Action
            onclick={submit}
            disabled={busy || !body.trim()}
            data-testid="feedback-send"
            class="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send"}
          </AlertDialog.Action>
        {/if}
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
