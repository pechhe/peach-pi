<script lang="ts">
  import { gitCommitPush, gitPr, gitMerge } from "../lib/api.ts";
  import type { Master } from "../lib/store.svelte.ts";
  import Icon from "./Icon.svelte";

  let {
    master,
    threadId,
    onClose,
    onToast,
  }: {
    master: Master;
    threadId: string;
    onClose: () => void;
    onToast: (msg: string, kind: "ok" | "err") => void;
  } = $props();

  let busy = $state<string | null>(null);
  let message = $state("");
  // Destructive actions (PR / merge) require a second tap to confirm.
  let confirming = $state<"pr" | "merge" | null>(null);

  async function commitPush(): Promise<void> {
    busy = "commit";
    try {
      const r = await gitCommitPush(master, threadId, message.trim() || undefined);
      if (r.ok) {
        onToast(r.pushed ? `Pushed ${r.branch}` : `Committed ${r.branch} (push failed)`, "ok");
        onClose();
      } else onToast(r.error, "err");
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
    }
  }

  async function openPr(): Promise<void> {
    busy = "pr";
    try {
      const r = await gitPr(master, threadId);
      if (r.ok) {
        window.open(r.url, "_blank");
        onToast("Opening PR…", "ok");
        onClose();
      } else onToast(r.error, "err");
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
      confirming = null;
    }
  }

  async function merge(): Promise<void> {
    busy = "merge";
    try {
      const r = await gitMerge(master, threadId);
      if (r.ok) {
        onToast(r.warning ? `Merged into ${r.target} · ${r.warning}` : `Merged into ${r.target}`, "ok");
        onClose();
      } else onToast(r.error, "err");
    } catch (e) {
      onToast((e as Error).message, "err");
    } finally {
      busy = null;
      confirming = null;
    }
  }
</script>

<!-- Backdrop + bottom sheet -->
<div class="pp-fade-in fixed inset-0 z-40 bg-black/50" onclick={onClose} role="presentation"></div>
<div class="pp-sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-bg px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
  <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong"></div>
  <div class="mb-3 flex items-center gap-2">
    <span class="text-accent"><Icon name="git-branch" size={16} sw={1.8} /></span>
    <span class="text-[15px] font-semibold">Git actions</span>
    <button class="ml-auto text-fainter" onclick={onClose} aria-label="Close"><Icon name="x" size={18} sw={2} /></button>
  </div>

  <input
    bind:value={message}
    placeholder="Commit message (optional — auto-generated)"
    class="mb-2.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-fg outline-none placeholder:text-fainter"
  />

  <button
    class="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left disabled:opacity-50"
    onclick={commitPush}
    disabled={busy !== null}
  >
    <span class="text-accent">
      {#if busy === "commit"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="git-commit" size={18} sw={1.8} />{/if}
    </span>
    <div class="flex-1">
      <div class="text-[14px] font-semibold">Commit &amp; push</div>
      <div class="text-[11px] text-faint">Stage all, commit, push to origin</div>
    </div>
  </button>

  <button
    class="mb-2 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left disabled:opacity-50 {confirming ===
    'pr'
      ? 'border-accent bg-accent/10'
      : 'border-border bg-surface'}"
    onclick={() => (confirming === "pr" ? openPr() : (confirming = "pr"))}
    disabled={busy !== null}
  >
    <span class="text-accent">
      {#if busy === "pr"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="git-pull-request" size={18} sw={1.8} />{/if}
    </span>
    <div class="flex-1">
      <div class="text-[14px] font-semibold">{confirming === "pr" ? "Tap again to open PR" : "Open pull request"}</div>
      <div class="text-[11px] text-faint">Compare branch against default on GitHub</div>
    </div>
  </button>

  <button
    class="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left disabled:opacity-50 {confirming ===
    'merge'
      ? 'border-danger bg-danger/10'
      : 'border-border bg-surface'}"
    onclick={() => (confirming === "merge" ? merge() : (confirming = "merge"))}
    disabled={busy !== null}
  >
    <span class={confirming === "merge" ? "text-danger" : "text-warning-fg"}>
      {#if busy === "merge"}<Icon name="spinner" size={18} sw={3} />{:else}<Icon name="git-merge" size={18} sw={1.8} />{/if}
    </span>
    <div class="flex-1">
      <div class="text-[14px] font-semibold">
        {confirming === "merge" ? "Tap again to merge to local" : "Merge to local"}
      </div>
      <div class="text-[11px] text-faint">--no-ff into the local project branch</div>
    </div>
  </button>
</div>
