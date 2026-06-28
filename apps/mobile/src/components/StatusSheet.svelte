<script lang="ts">
  import { snoozeThread, unsnoozeThread, markToTest, unmarkToTest, archiveThread } from "../lib/api.ts";
  import type { Master, } from "../lib/store.svelte.ts";
  import type { RemoteSessionInfo } from "@peach-pi/shared-types";
  import Icon from "./Icon.svelte";

  let {
    master,
    thread,
    onClose,
    onToast,
  }: {
    master: Master;
    thread: RemoteSessionInfo;
    onClose: () => void;
    onToast: (msg: string, kind: "ok" | "err") => void;
  } = $props();

  let busy = $state<string | null>(null);
  // Destructive/lane-changing actions require a second tap to confirm.
  let confirming = $state<"archive" | null>(null);
  let showSnoozePresets = $state(false);

  const SNOOZE_PRESETS = [
    { label: "1 hour", ms: 3_600_000 },
    { label: "3 hours", ms: 3 * 3_600_000 },
    { label: "Tomorrow", ms: 24 * 3_600_000 },
    { label: "3 days", ms: 3 * 24 * 3_600_000 },
    { label: "1 week", ms: 7 * 24 * 3_600_000 },
  ];

  const isSnoozed = $derived(!!thread.snoozedUntil);
  const isToTest = $derived(!!thread.toTestAt);

  async function doSnooze(ms: number): Promise<void> {
    busy = "snooze";
    try {
      await snoozeThread(master, thread.threadId, new Date(Date.now() + ms).toISOString());
      onToast("Snoozed", "ok");
      onClose();
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
      showSnoozePresets = false;
    }
  }

  async function doUnsnooze(): Promise<void> {
    busy = "unsnooze";
    try {
      await unsnoozeThread(master, thread.threadId);
      onToast("Unsnoozed", "ok");
      onClose();
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
    }
  }

  async function doMarkToTest(): Promise<void> {
    busy = "markToTest";
    try {
      await markToTest(master, thread.threadId);
      onToast("Marked for testing", "ok");
      onClose();
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
    }
  }

  async function doUnmarkToTest(): Promise<void> {
    busy = "unmarkToTest";
    try {
      await unmarkToTest(master, thread.threadId);
      onToast("Removed to-test mark", "ok");
      onClose();
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
    }
  }

  async function doArchive(): Promise<void> {
    busy = "archive";
    try {
      await archiveThread(master, thread.threadId);
      onToast("Archived", "ok");
      onClose();
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
      confirming = null;
    }
  }
</script>

<div class="pp-fade-in fixed inset-0 z-40 bg-black/50" onclick={onClose} role="presentation"></div>
<div class="pp-sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-bg px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
  <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong"></div>
  <div class="mb-3 flex items-center gap-2">
    <span class="text-accent"><Icon name="inbox" size={16} sw={1.8} /></span>
    <span class="text-[15px] font-semibold">Thread status</span>
    <button class="ml-auto text-fainter" onclick={onClose} aria-label="Close"><Icon name="x" size={18} sw={2} /></button>
  </div>

  <div class="mb-2.5 truncate text-[13px] text-faint">{thread.title || thread.threadId}</div>

  {#if showSnoozePresets}
    <div class="mb-2.5 grid grid-cols-1 gap-2">
      {#each SNOOZE_PRESETS as p (p.label)}
        <button
          class="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
          onclick={() => doSnooze(p.ms)}
          disabled={busy !== null}
        >
          <span class="text-accent">
            {#if busy === "snooze"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="clock" size={18} sw={1.8} />{/if}
          </span>
          <div class="flex-1">
            <div class="text-[14px] font-semibold">{p.label}</div>
          </div>
        </button>
      {/each}
      <button class="text-[12px] text-faint" onclick={() => (showSnoozePresets = false)}>Cancel</button>
    </div>
  {:else}
    <!-- Snooze / unsnooze -->
    {#if isSnoozed}
      <button
        class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
        onclick={doUnsnooze}
        disabled={busy !== null}
      >
        <span class="text-accent">
          {#if busy === "unsnooze"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="clock" size={18} sw={1.8} />{/if}
        </span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">Unsnooze</div>
          <div class="text-[11px] text-faint">Snoozed {thread.snoozedUntil ? new Date(thread.snoozedUntil).toLocaleString() : ""}</div>
        </div>
      </button>
    {:else}
      <button
        class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
        onclick={() => (showSnoozePresets = true)}
        disabled={busy !== null}
      >
        <span class="text-accent"><Icon name="clock" size={18} sw={1.8} /></span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">Snooze…</div>
          <div class="text-[11px] text-faint">Hide until a later time</div>
        </div>
      </button>
    {/if}

    <!-- Mark / unmark for testing -->
    {#if isToTest}
      <button
        class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
        onclick={doUnmarkToTest}
        disabled={busy !== null}
      >
        <span class="text-accent">
          {#if busy === "unmarkToTest"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="beaker" size={18} sw={1.8} />{/if}
        </span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">Remove to-test mark</div>
          {#if thread.toTestNote}
            <div class="text-[11px] text-faint">{thread.toTestNote}</div>
          {/if}
        </div>
      </button>
    {:else}
      <button
        class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
        onclick={doMarkToTest}
        disabled={busy !== null}
      >
        <span class="text-accent">
          {#if busy === "markToTest"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="beaker" size={18} sw={1.8} />{/if}
        </span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">Mark for testing</div>
          <div class="text-[11px] text-faint">Park for a manual check</div>
        </div>
      </button>
    {/if}

    <!-- Archive (confirm) -->
    <button
      class="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left disabled:opacity-50 {confirming ===
      'archive'
        ? 'border-danger bg-danger/10'
        : 'border-border bg-surface'}"
      onclick={() => (confirming === "archive" ? doArchive() : (confirming = "archive"))}
      disabled={busy !== null}
    >
      <span class="text-danger">
        {#if busy === "archive"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="inbox" size={18} sw={1.8} />{/if}
      </span>
      <div class="flex-1">
        <div class="text-[14px] font-semibold">{confirming === "archive" ? "Tap again to archive" : "Archive"}</div>
        <div class="text-[11px] text-faint">Remove from active threads</div>
      </div>
    </button>
  {/if}
</div>
