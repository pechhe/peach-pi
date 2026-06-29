<script lang="ts">
  import { onMount } from "svelte";
  import type { RemoteSessionInfo } from "@peach-pi/shared-types";
  import { store } from "../lib/store.svelte.ts";
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

  // Group a lane's threads under their project parent — mirrors the desktop
  // sidebar's nested project → thread structure. Chats (null project) group
  // under a synthetic "Threads" bucket so they don't lose their parent row.
  function groupByProject(list: RemoteSessionInfo[]): { project: string; threads: RemoteSessionInfo[] }[] {
    const map = new Map<string, RemoteSessionInfo[]>();
    for (const s of list) {
      const key = s.projectName ?? "Threads";
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()].map(([project, threads]) => ({ project, threads }));
  }

  function openSession(s: RemoteSessionInfo): void {
    store.push({ name: "transcript", masterId, threadId: s.threadId, title: s.title || s.threadId });
  }

  function onStatusDone(): void {
    statusFor = null;
    void refresh(true);
  }
</script>

<header class="px-4 pt-1.5 pb-1">
  <div class="flex items-center py-1">
    <button class="-ml-1 flex items-center text-accent" onclick={() => store.pop()} aria-label="Back">
      <Icon name="chevron-left" size={20} sw={2.4} />
      <span class="ml-0.5 text-[15px]">{master?.name ?? "Master"}</span>
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
    <!-- Active lane: threads grouped under their project parent -->
    {@const groups = groupByProject(lanes.active)}
    <div class="flex flex-col gap-4">
      {#each groups as group (group.project)}
        <section>
          <div class="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="folder" size={11} sw={1.8} />
            <span class="truncate">{group.project}</span>
            <span class="text-fainter">{group.threads.length}</span>
          </div>
          <div class="flex flex-col gap-1">
            {#each group.threads as s (s.threadId)}
              <button
                class="pp-tap flex w-full items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3 py-2 text-left transition-colors {s.status ===
                'running'
                  ? 'border-accent/30'
                  : ''} active:bg-surface-2"
                onclick={() => openSession(s)}
              >
                {#if s.status === "running"}
                  <span class="shrink-0 text-accent"><HexSpinner size={15} dotSize={2} /></span>
                {:else if s.status === "completed"}
                  <span class="shrink-0 text-success"><Icon name="check" size={15} /></span>
                {:else if s.status === "failed"}
                  <span class="shrink-0 text-danger"><Icon name="alert-circle" size={15} sw={1.6} /></span>
                {:else}
                  <span class="mx-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-fainter"></span>
                {/if}
                <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.title || s.threadId}</span>
                {#if s.lastCheckpointSha}
                  <span class="shrink-0 font-mono text-[10.5px] text-fainter">
                    {s.lastCheckpointSha.slice(0, 7)}
                  </span>
                {/if}
                <button
                  class="shrink-0 px-1 text-[10px] text-faint"
                  onclick={(e) => { e.stopPropagation(); statusFor = s; }}
                  aria-label="Thread status"
                >
                  <span class="capitalize">{s.status}</span>
                </button>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    <!-- Collapsible non-active lanes -->
    {#each LANE_META as meta (meta.key)}
      {#if lanes[meta.key].length > 0}
        {@const open = expanded[meta.key]}
        {@const nonActiveGroups = groupByProject(lanes[meta.key])}
        <div class="mt-4 border-t border-border pt-2.5">
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
            <div class="mt-1.5 flex flex-col gap-3 opacity-70">
              {#each nonActiveGroups as group (group.project)}
                <div>
                  <div class="flex items-center gap-1.5 px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                    <Icon name="folder" size={10} sw={1.8} />
                    <span class="truncate">{group.project}</span>
                  </div>
                  <div class="flex flex-col gap-1">
                    {#each group.threads as s (s.threadId)}
                      <div class="pp-tap flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-left active:bg-surface-3"
                        role="button"
                        tabindex="0"
                        onclick={() => openSession(s)}
                        onkeydown={(e) => e.key === 'Enter' && openSession(s)}
                      >
                        <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.title || s.threadId}</span>
                        {#if meta.key === "snoozed" && s.snoozedUntil}
                          <span class="shrink-0 text-[10.5px] text-faint">Until {new Date(s.snoozedUntil).toLocaleString()}</span>
                        {:else if meta.key === "toTest" && s.toTestNote}
                          <span class="shrink-0 truncate max-w-[35%] text-[10.5px] text-faint">{s.toTestNote}</span>
                        {/if}
                        <button
                          class="shrink-0 px-1 text-[10px] text-faint"
                          onclick={(e) => { e.stopPropagation(); statusFor = s; }}
                          aria-label="Thread status"
                        >
                          <span class="capitalize">{s.status}</span>
                        </button>
                      </div>
                    {/each}
                  </div>
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
