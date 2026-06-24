<script lang="ts">
  import { onMount } from "svelte";
  import type { RemoteSessionInfo } from "@peach-pi/shared-types";
  import { store } from "../lib/store.svelte.ts";
  import { listSessions } from "../lib/api.ts";
  import Icon from "../components/Icon.svelte";

  let { masterId }: { masterId: string } = $props();
  const master = $derived(store.master(masterId));

  let loading = $state(false);
  let error = $state("");

  async function refresh(): Promise<void> {
    if (!master) return;
    loading = true;
    error = "";
    try {
      store.setSessions(masterId, await listSessions(master));
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!store.sessions[masterId]) refresh();
  });

  const sessions = $derived(store.sessions[masterId] ?? []);

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
</script>

<header class="px-4 pt-1">
  <div class="flex items-center py-1">
    <button class="-ml-1 flex items-center text-accent" onclick={() => store.pop()}>
      <Icon name="chevron-left" size={20} sw={2.4} />
      <span class="ml-0.5 text-[15px]">Masters</span>
    </button>
    <button class="ml-auto text-faint" onclick={refresh} aria-label="Refresh sessions">
      <Icon name="refresh" size={18} sw={1.8} />
    </button>
  </div>
  <div class="px-1 pt-1 pb-3">
    <h1 class="text-[24px] font-bold tracking-[-0.02em]">{master?.name ?? "Master"}</h1>
    <div class="mt-0.5 font-mono text-[12px] text-faint">
      {master?.host}:{master?.port}{#if sessions.length} · {sessions.length} served{/if}
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
    <!-- proto 07 · empty state -->
    <div class="flex flex-col items-center justify-center gap-3.5 px-10 pt-24 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-fainter">
        <Icon name="wifi-off" size={26} />
      </div>
      <div>
        <div class="text-[16px] font-semibold">No sessions served</div>
        <p class="mt-1 text-[13px] leading-[1.5] text-faint">
          This master isn't serving any projects yet. Enable serving in peach-pi on the master
          machine.
        </p>
      </div>
      <button
        class="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-[13px] text-accent"
        onclick={refresh}
      >
        <Icon name="refresh" size={14} sw={1.8} /> Refresh sessions
      </button>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each sessions as s (s.threadId)}
        <button
          class="rounded-[14px] border border-border bg-surface p-3.5 text-left {s.status === 'running'
            ? 'border-accent/30'
            : ''}"
          onclick={() => openSession(s)}
        >
          <div class="flex items-center gap-2.5">
            {#if s.status === "running"}
              <span class="shrink-0 text-accent"><Icon name="spinner" size={15} sw={3} /></span>
            {:else if s.status === "completed"}
              <span class="shrink-0 text-success"><Icon name="check" size={15} /></span>
            {:else if s.status === "failed"}
              <span class="shrink-0 text-danger"><Icon name="alert-circle" size={15} sw={1.6} /></span>
            {:else}
              <span class="mx-[3px] h-2 w-2 shrink-0 rounded-full bg-fainter"></span>
            {/if}
            <span class="flex-1 truncate text-[14px] font-semibold">{s.title || s.threadId}</span>
          </div>
          <div class="mt-2 flex items-center gap-2 pl-6">
            <span class="text-[11px] font-medium {statusColor(s.status)}">{s.status}</span>
            {#if repoName(s.originUrl)}
              <span class="text-border-strong">·</span>
              <span class="font-mono text-[11px] text-faint">{repoName(s.originUrl)}</span>
            {/if}
            {#if s.lastCheckpointSha}
              <span class="ml-auto font-mono text-[11px] text-fainter">
                ckpt {s.lastCheckpointSha.slice(0, 7)}
              </span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
