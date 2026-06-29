<script lang="ts">
  import { onMount } from "svelte";
  import type { RemoteSessionInfo } from "@peach-pi/shared-types";
  import { store, hostLabel } from "../lib/store.svelte.ts";
  import { listSessions, RosterTapClient, type TapStatus } from "../lib/api.ts";
  import Icon from "../components/Icon.svelte";
  import HexSpinner from "../components/HexSpinner.svelte";
  import StatusSheet from "../components/StatusSheet.svelte";

  let { masterId }: { masterId: string } = $props();
  const master = $derived(store.master(masterId));

  let loading = $state(false);
  let error = $state("");
  let toast = $state<{ msg: string; kind: "ok" | "err" } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let statusFor = $state<RemoteSessionInfo | null>(null);
  let rosterStatus = $state<TapStatus>({ kind: "connecting" });
  let expanded = $state<Record<Lane, boolean>>({
    active: true,
    snoozed: false,
    toTest: false,
    archived: false,
  });

  type Lane = "active" | "snoozed" | "toTest" | "archived";

  function flash(msg: string, kind: "ok" | "err"): void {
    toast = { msg, kind };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3200);
  }

  async function refresh(quiet = false): Promise<void> {
    if (!master) return;
    loading = !quiet;
    error = "";
    try {
      store.setSessions(masterId, await listSessions(master));
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  // Roster tap: full served-thread snapshot on connect, then live updates on
  // every roster-shape change (status flip, checkpoint, create/archive/snooze,
  // lease handoff). Replaces the cached list wholesale each frame — no manual
  // refresh button needed.
  let rosterClient: RosterTapClient | null = null;
  function connectRoster(): void {
    if (!master) return;
    rosterClient?.close();
    rosterClient = new RosterTapClient(master, {
      onRoster: (sessions) => store.setSessions(masterId, sessions),
      onStatus: (s) => (rosterStatus = s),
    });
    rosterClient.start();
  }

  function onVisibility(): void {
    if (document.hidden) {
      rosterClient?.close(); // iOS suspends the stream anyway; drop it cleanly
    } else {
      connectRoster(); // resume — a fresh snapshot re-seeds the list
    }
  }

  onMount(() => {
    // Seed once so the screen renders before the tap opens, then stream.
    if (master && !store.sessions[masterId]) refresh();
    connectRoster();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      rosterClient?.close();
    };
  });

  const sessions = $derived(store.sessions[masterId] ?? []);

  // Mirrors desktop Sidebar.svelte classification:
  //   active   = !archived && !snoozed && !toTest
  //   snoozed  = !archived && snoozed
  //   toTest   = !archived && !snoozed && toTest
  //   archived = archived
  function laneOf(s: RemoteSessionInfo): Lane {
    if (s.archived) return "archived";
    if (s.snoozedUntil) return "snoozed";
    if (s.toTestAt) return "toTest";
    return "active";
  }

  const lanes = $derived.by(() => {
    const out: Record<Lane, RemoteSessionInfo[]> = {
      active: [],
      snoozed: [],
      toTest: [],
      archived: [],
    };
    for (const s of sessions) out[laneOf(s)].push(s);
    return out;
  });

  const LANE_META: { key: Lane; label: string; icon: "clock" | "beaker" | "inbox" }[] = [
    { key: "snoozed", label: "Snoozed", icon: "clock" },
    { key: "toTest", label: "To test", icon: "beaker" },
    { key: "archived", label: "Archived", icon: "inbox" },
  ];

  function repoName(url: string | null): string | null {
    if (!url) return null;
    return url.replace(/\.git$/, "").split(/[/:]/).pop() || null;
  }

  function statusColor(s: RemoteSessionInfo["status"]): string {
    return s === "running"
      ? "text-accent"
      : s === "completed"
        ? "text-success"
        : s === "failed"
          ? "text-danger"
          : "text-muted";
  }

  function openSession(s: RemoteSessionInfo): void {
    store.push({ name: "transcript", masterId, threadId: s.threadId, title: s.title || s.threadId });
  }

  function onStatusDone(): void {
    statusFor = null;
    void refresh(true);
  }
</script>

<header class="px-4 pt-1">
  <div class="flex items-center py-1">
    <button class="-ml-1 flex items-center text-accent" onclick={() => store.pop()}>
      <Icon name="chevron-left" size={20} sw={2.4} />
      <span class="ml-0.5 text-[15px]">Masters</span>
    </button>
    <!-- Live roster indicator (replaces the manual refresh button). The list
         now streams via the roster tap; the dot reflects connection state. -->
    <span class="ml-auto flex items-center gap-1.5 text-[11px]" aria-label="Roster stream status">
      {#if rosterStatus.kind === "live"}
        <span class="h-1.5 w-1.5 rounded-full bg-success pp-pulse"></span>
      {:else if rosterStatus.kind === "connecting"}
        <span class="text-faint"><Icon name="spinner" size={12} sw={3} /></span>
      {:else if rosterStatus.kind === "reconnecting"}
        <span class="pp-spin text-warning-fg"><Icon name="spinner" size={12} sw={3} /></span>
      {:else}
        <span class="h-1.5 w-1.5 rounded-full bg-fainter"></span>
      {/if}
    </span>
    <button
      class="ml-4 flex items-center text-accent"
      onclick={() => store.push({ name: "new-thread", masterId })}
      aria-label="New thread"
    >
      <Icon name="plus" size={20} sw={2.2} />
    </button>
  </div>
  <div class="px-1 pt-1 pb-3">
    <h1 class="text-[24px] font-bold tracking-[-0.02em]">{master?.name ?? "Master"}</h1>
    <div class="mt-0.5 font-mono text-[12px] text-faint">
      {master ? hostLabel(master) : ""}{#if sessions.length} · {lanes.active.length} active · {sessions.length} served{/if}
    </div>
  </div>
</header>

<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
  {#if error}
    <div class="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
      {error}
    </div>
  {/if}

  {#if loading && sessions.length === 0}
    <div class="flex items-center justify-center gap-2 py-16 text-[13px] text-faint">
      <span class="text-accent"><Icon name="spinner" size={16} sw={3} /></span> Loading sessions…
    </div>
  {:else if sessions.length === 0 && !error}
    <div class="flex flex-col items-center justify-center gap-3.5 px-10 pt-24 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-fainter">
        <Icon name="wifi-off" size={26} />
      </div>
      <div>
        <div class="text-[16px] font-semibold">No sessions served</div>
        <p class="mt-1 text-[13px] leading-[1.5] text-faint">
          This master isn't serving any projects yet. Enable serving in peach-pi on the master machine.
        </p>
      </div>
      <button
        class="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-[13px] text-accent"
        onclick={() => connectRoster()}
      >
        <Icon name="refresh" size={14} sw={1.8} /> Reconnect
      </button>
    </div>
  {:else}
    <!-- Active lane -->
    <div class="flex flex-col gap-2">
      {#each lanes.active as s (s.threadId)}
        <div
          class="rounded-[14px] border border-border bg-surface p-3.5 text-left {s.status === 'running'
            ? 'border-accent/30'
            : ''}"
        >
          <button class="flex w-full items-center gap-2.5 text-left" onclick={() => openSession(s)}>
            {#if s.status === "running"}
              <span class="shrink-0 text-accent"><HexSpinner size={15} dotSize={2} /></span>
            {:else if s.status === "completed"}
              <span class="shrink-0 text-success"><Icon name="check" size={15} /></span>
            {:else if s.status === "failed"}
              <span class="shrink-0 text-danger"><Icon name="alert-circle" size={15} sw={1.6} /></span>
            {:else}
              <span class="mx-[3px] h-2 w-2 shrink-0 rounded-full bg-fainter"></span>
            {/if}
            <span class="flex-1 truncate text-[14px] font-semibold">{s.title || s.threadId}</span>
          </button>
          <button class="mt-2 flex w-full items-center gap-2 pl-6 text-left" onclick={() => (statusFor = s)} aria-label="Thread status">
            <span class="text-[11px] font-medium {statusColor(s.status)}">{s.status}</span>
            {#if repoName(s.originUrl)}
              <span class="text-border-strong">·</span>
              <span class="font-mono text-[11px] text-faint">{repoName(s.originUrl)}</span>
            {/if}
            {#if s.lastCheckpointSha}
              <span class="ml-auto font-mono text-[11px] text-fainter">
                ckpt {s.lastCheckpointSha.slice(0, 7)}
              </span>
            {:else}
              <span class="ml-auto shrink-0 text-fainter"><Icon name="chevron-right" size={16} sw={2} /></span>
            {/if}
          </button>
        </div>
      {/each}
    </div>

    <!-- Collapsible non-active lanes -->
    {#each LANE_META as meta (meta.key)}
      {#if lanes[meta.key].length > 0}
        {@const open = expanded[meta.key]}
        <div class="mt-3 border-t border-border pt-2.5">
          <button
            class="flex w-full items-center gap-2 px-1 py-1.5 text-[13px] font-semibold text-muted"
            onclick={() => (expanded = { ...expanded, [meta.key]: !open })}
            aria-expanded={open}
          >
            <span class="text-fainter"><Icon name={meta.icon} size={14} sw={1.8} /></span>
            {meta.label}
            <span class="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-faint">{lanes[meta.key].length}</span>
            <span class="ml-auto text-fainter">
              <Icon name="chevron-right" size={14} sw={2} />
            </span>
          </button>
          {#if open}
            <div class="mt-1.5 flex flex-col gap-2 opacity-70">
              {#each lanes[meta.key] as s (s.threadId)}
                <div class="rounded-[12px] border border-border bg-surface-2 p-3 text-left">
                  <button class="flex w-full items-center gap-2 text-left" onclick={() => openSession(s)}>
                    <span class="flex-1 truncate text-[13.5px] font-semibold">{s.title || s.threadId}</span>
                  </button>
                  <button class="mt-1 flex w-full items-center gap-2 text-left" onclick={() => (statusFor = s)} aria-label="Thread status">
                    <span class="shrink-0 text-fainter">
                      {#if meta.key === "snoozed" && s.snoozedUntil}
                        <span class="text-[11px] text-faint">Until {new Date(s.snoozedUntil).toLocaleString()}</span>
                      {:else if meta.key === "toTest" && s.toTestNote}
                        <span class="text-[11px] text-faint">{s.toTestNote}</span>
                      {:else if repoName(s.originUrl)}
                        <span class="font-mono text-[11px] text-faint">{repoName(s.originUrl)}</span>
                      {/if}
                    </span>
                    <span class="ml-auto shrink-0 text-fainter"><Icon name="chevron-right" size={14} sw={2} /></span>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>

{#if toast}
  <div class="pp-banner-in pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
    <div
      class="max-w-[90%] truncate rounded-full px-3.5 py-2 text-[12.5px] font-medium {toast.kind === 'ok'
        ? 'bg-success/15 text-success'
        : 'bg-danger/15 text-danger'}"
    >
      {toast.msg}
    </div>
  </div>
{/if}

{#if statusFor && master}
  <StatusSheet
    {master}
    thread={statusFor}
    onClose={onStatusDone}
    onToast={(m, k) => flash(m, k)}
  />
{/if}
