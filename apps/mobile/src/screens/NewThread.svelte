<script lang="ts">
  import { onMount } from "svelte";
  import type { RemoteSessionInfo } from "@peach-pi/shared-types";
  import { store } from "../lib/store.svelte.ts";
  import { listProjects, createThread, createChat } from "../lib/api.ts";
  import Icon from "../components/Icon.svelte";

  let { masterId }: { masterId: string } = $props();
  const master = $derived(store.master(masterId));

  let loading = $state(false);
  let creating = $state(false);
  let error = $state("");

  async function refresh(): Promise<void> {
    if (!master) return;
    loading = true;
    error = "";
    try {
      store.setProjects(masterId, await listProjects(master));
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!store.projects[masterId]) refresh();
  });

  const projects = $derived(store.projects[masterId] ?? []);

  // After creating, prepend to the cached session list and open the transcript.
  function open(s: RemoteSessionInfo): void {
    const list = store.sessions[masterId] ?? [];
    store.setSessions(masterId, [s, ...list.filter((x) => x.threadId !== s.threadId)]);
    store.stack = [
      { name: "masters" },
      { name: "sessions", masterId },
      { name: "transcript", masterId, threadId: s.threadId, title: s.title || s.threadId },
    ];
  }

  async function startThread(projectId: string): Promise<void> {
    if (!master || creating) return;
    creating = true;
    error = "";
    try {
      open(await createThread(master, projectId));
    } catch (e) {
      error = (e as Error).message;
      creating = false;
    }
  }

  async function startChat(): Promise<void> {
    if (!master || creating) return;
    creating = true;
    error = "";
    try {
      open(await createChat(master));
    } catch (e) {
      error = (e as Error).message;
      creating = false;
    }
  }
</script>

<header class="px-4 pt-1">
  <div class="flex items-center py-1">
    <button class="-ml-1 flex items-center text-accent" onclick={() => store.pop()}>
      <Icon name="chevron-left" size={20} sw={2.4} />
      <span class="ml-0.5 text-[15px]">Back</span>
    </button>
  </div>
  <div class="px-1 pt-1 pb-3">
    <h1 class="text-[24px] font-bold tracking-[-0.02em]">New thread</h1>
    <div class="mt-0.5 text-[12px] text-faint">Pick a served project to start a session</div>
  </div>
</header>

<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
  {#if error}
    <div class="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
      {error}
    </div>
  {/if}

  {#if creating}
    <div class="flex items-center justify-center gap-2 py-16 text-[13px] text-faint">
      <span class="text-accent"><Icon name="spinner" size={16} sw={3} /></span> Starting…
    </div>
  {:else if loading && projects.length === 0}
    <div class="flex items-center justify-center gap-2 py-16 text-[13px] text-faint">
      <span class="text-accent"><Icon name="spinner" size={16} sw={3} /></span> Loading projects…
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each projects as p (p.id)}
        <button
          class="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3.5 text-left"
          onclick={() => startThread(p.id)}
        >
          <span class="shrink-0 text-accent"><Icon name="folder" size={18} sw={1.7} /></span>
          <span class="flex-1 truncate text-[14px] font-semibold">{p.name}</span>
          <span class="shrink-0 text-fainter"><Icon name="chevron-right" size={16} sw={2} /></span>
        </button>
      {/each}

      <button
        class="mt-1 flex items-center gap-3 rounded-[14px] border border-border bg-surface-2 p-3.5 text-left"
        onclick={startChat}
      >
        <span class="shrink-0 text-muted"><Icon name="message" size={18} sw={1.7} /></span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">New chat</div>
          <div class="text-[11px] text-faint">No repo — a scratch conversation</div>
        </div>
      </button>

      {#if projects.length === 0 && !loading}
        <p class="px-6 pt-10 text-center text-[13px] leading-[1.5] text-faint">
          No served projects. Enable serving for a project in peach-pi on the master.
        </p>
      {/if}
    </div>
  {/if}
</div>
