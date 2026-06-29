<script lang="ts">
  import { onMount } from "svelte";
  import { applyTranscriptOps, type TranscriptItem } from "@peach-pi/shared-types";
  import { store } from "../lib/store.svelte.ts";
  import { TapClient, type TapStatus, listModels, getSessionMeta } from "../lib/api.ts";
  import type { ScopedModel, SessionMeta } from "@peach-pi/shared-types";
  import Icon from "../components/Icon.svelte";
  import TranscriptItemView from "../components/TranscriptItem.svelte";
  import Composer from "../components/Composer.svelte";
  import GitActions from "../components/GitActions.svelte";

  let { masterId, threadId, title }: { masterId: string; threadId: string; title: string } = $props();
  const master = $derived(store.master(masterId));

  let items = $state<TranscriptItem[]>([]);
  let remoteSeq = $state(0);
  let lastCheckpointSha = $state<string | null>(null);
  // Checkpoint dividers, placed inline after the Nth folded item (arrival order).
  let checkpoints = $state<{ sha: string; after: number }[]>([]);
  let status = $state<TapStatus>({ kind: "connecting" });
  let copied = $state(false);
  // Live run/queue state (ADR-0010) folded from the tap, driving the composer.
  let running = $state(false);
  let followUp = $state<string[]>([]);
  // Model catalog + live session meta, for the composer's model/reasoning picker.
  let models = $state<ScopedModel[]>([]);
  let meta = $state<SessionMeta | null>(null);
  let showGit = $state(false);
  let toast = $state<{ msg: string; kind: "ok" | "err" } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function flash(msg: string, kind: "ok" | "err"): void {
    toast = { msg, kind };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3200);
  }

  let client: TapClient | null = null;
  let scroller = $state<HTMLDivElement | null>(null);

  function foldFrame(frame: import("@peach-pi/shared-types").RemoteTapFrame): void {
    if (frame.threadId !== threadId) return;
    if (frame.kind === "backfill") {
      items = [...frame.items];
      remoteSeq = frame.seq;
    } else if (frame.kind === "transcript") {
      if (frame.seq <= remoteSeq) return; // already folded into the backfill
      items = applyTranscriptOps(items, frame.ops);
      remoteSeq = frame.seq;
    } else if (frame.kind === "checkpoint") {
      lastCheckpointSha = frame.sha;
      checkpoints = [...checkpoints, { sha: frame.sha, after: items.length }];
    } else if (frame.kind === "status") {
      running = frame.status === "running";
    } else if (frame.kind === "queue") {
      followUp = frame.followUp;
    }
    store.setSeq(masterId, threadId, remoteSeq);
    client?.setLastSeq(remoteSeq);
    queueScroll();
  }

  let nearBottom = true;
  function onScroll(): void {
    if (!scroller) return;
    nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }
  function queueScroll(): void {
    if (!nearBottom) return;
    requestAnimationFrame(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  function connect(): void {
    if (!master) return;
    client?.close();
    client = new TapClient(master, threadId, store.getSeq(masterId, threadId), {
      onFrame: foldFrame,
      onStatus: (s) => (status = s),
    });
    client.start();
    // Best-effort catalog + live meta fetch; failures surface nowhere (the
    // composer falls back to the session default).
    void listModels(master).then((m) => (models = m)).catch(() => {});
    void refreshMeta();
  }

  async function refreshMeta(): Promise<void> {
    if (!master) return;
    try {
      meta = await getSessionMeta(master, threadId);
    } catch {
      // Master offline / meta unavailable — composer uses defaults.
    }
  }

  async function copySha(): Promise<void> {
    if (!lastCheckpointSha) return;
    try {
      await navigator.clipboard.writeText(lastCheckpointSha);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard blocked — the SHA is still visible to copy by hand.
    }
  }

  function onVisibility(): void {
    if (document.hidden) {
      client?.close(); // iOS suspends the stream anyway; drop it cleanly
    } else if (status.kind !== "ended") {
      connect(); // resume from the persisted watermark
      void refreshMeta();
    }
  }

  onMount(() => {
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      client?.close();
    };
  });

  const reconnecting = $derived(status.kind === "reconnecting");
  const ended = $derived(status.kind === "ended");

  // Reflect status flips back into a meta refresh so the pill stays in sync
  // when a run completes (the master's thinking/model may have changed).
  $effect(() => {
    void running;
    void refreshMeta();
  });
</script>

<header class="border-b border-border px-4 pt-1.5 pb-2.5">
  <div class="flex items-center gap-1.5">
    <button class="-ml-1 shrink-0 text-accent" onclick={() => store.pop()} aria-label="Back">
      <Icon name="chevron-left" size={18} sw={2.4} />
    </button>
    <div class="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</div>
    <button
      class="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 font-mono text-[11px] text-faint"
      onclick={() => (showGit = true)}
      aria-label="Git actions"
    >
      <Icon name="git-branch" size={11} sw={1.8} />
      {lastCheckpointSha ? lastCheckpointSha.slice(0, 7) : "git"}
    </button>
  </div>
  <div class="mt-1.5 flex items-center gap-1.5 text-[11px]">
    {#if status.kind === "live"}
      <span class="flex items-center gap-1.5 text-success">
        <span class="h-1.5 w-1.5 rounded-full bg-success pp-pulse"></span>live
      </span>
      <span class="text-border-strong">·</span>
      <span class="text-faint">read-only tap</span>
    {:else if status.kind === "connecting"}
      <span class="flex items-center gap-1.5 text-faint">
        <span class="text-faint"><Icon name="spinner" size={11} sw={3} /></span>connecting…
      </span>
    {:else if reconnecting}
      <span class="flex items-center gap-1.5 text-warning-fg">
        <span class="pp-spin text-warning-fg"><Icon name="spinner" size={11} sw={3} /></span>reconnecting
      </span>
    {:else if ended}
      <span class="flex items-center gap-1.5 text-faint">
        <span class="h-1.5 w-1.5 rounded-full bg-fainter"></span>ended
      </span>
    {/if}
  </div>
</header>

{#if reconnecting && status.kind === "reconnecting"}
  <div class="pp-banner-in flex items-center gap-2.5 border-b border-warning-border bg-warning-surface px-4 py-2.5">
    <span class="pp-spin shrink-0 text-warning-fg"><Icon name="reconnect" size={15} /></span>
    <div class="flex-1">
      <div class="text-[12.5px] font-semibold text-warning-fg">Dropped while backgrounded</div>
      <div class="text-[11px] text-muted">Resuming from seq {status.fromSeq} — no frames lost</div>
    </div>
  </div>
{/if}

<div
  bind:this={scroller}
  onscroll={onScroll}
  class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-4 pb-6 transition-opacity {reconnecting
    ? 'opacity-50'
    : ''}"
>
  {#each items as item, i (item.id)}
    <div class="pp-item-in flex flex-col gap-2.5">
      <TranscriptItemView {item} />
    </div>
    {#each checkpoints.filter((c) => c.after === i + 1) as c (c.sha + i)}
      <div class="flex items-center gap-2.5">
        <div class="h-px flex-1 bg-border"></div>
        <div class="flex items-center gap-1.5 text-[11.5px] text-accent">
          <Icon name="git-commit" size={12} sw={1.8} />
          Checkpoint <span class="font-mono">{c.sha.slice(0, 7)}</span>
        </div>
        <div class="h-px flex-1 bg-border"></div>
      </div>
    {/each}
  {/each}

  {#if items.length === 0 && status.kind !== "ended"}
    <p class="flex items-center justify-center gap-2 pt-10 text-[13px] text-faint">
      <span class="pp-spin"><Icon name="spinner" size={13} sw={3} /></span>
      {status.kind === "connecting" ? "Connecting…" : "Loading transcript…"}
    </p>
  {/if}
</div>

{#if reconnecting && status.kind === "reconnecting"}
  <div class="flex justify-center px-4 pb-5 pt-3">
    <div class="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-[12px] text-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-warning pp-pulse"></span>
      holding stream · retry in {Math.round(status.retryInMs / 1000)}s
    </div>
  </div>
{/if}

{#if toast}
  <div
    class="pp-banner-in pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4"
  >
    <div
      class="max-w-[90%] truncate rounded-full px-3.5 py-2 text-[12.5px] font-medium {toast.kind === 'ok'
        ? 'bg-success/15 text-success'
        : 'bg-danger/15 text-danger'}"
    >
      {toast.msg}
    </div>
  </div>
{/if}

{#if master && !ended}
  <Composer
    {master}
    {threadId}
    {running}
    {followUp}
    {models}
    {meta}
    sessionModel={meta?.model ?? null}
    sessionThinking={meta?.thinkingLevel ?? "off"}
    availableThinking={meta?.availableThinkingLevels ?? ["off"]}
    onError={(m) => flash(m, "err")}
  />
{/if}

{#if showGit && master}
  <GitActions
    {master}
    {threadId}
    onClose={() => (showGit = false)}
    onToast={(m, k) => flash(m, k)}
  />
{/if}

{#if ended}
  <!-- proto 06 · stream ended → copy SHA / open on laptop -->
  <div class="border-t border-border px-4 pb-5 pt-3.5">
    <div class="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
      <span class="shrink-0 text-muted"><Icon name="laptop" size={18} sw={1.6} /></span>
      <div class="flex-1">
        <div class="text-[13px] font-semibold">Test this checkpoint</div>
        <div class="text-[11px] text-faint">
          {lastCheckpointSha ? "Needs a clone — open on your laptop" : "No checkpoint recorded yet"}
        </div>
      </div>
      {#if lastCheckpointSha}
        <button class="shrink-0 text-[12px] font-medium text-accent" onclick={copySha}>
          {copied ? "Copied" : "Copy SHA"}
        </button>
      {/if}
    </div>
  </div>
{/if}
