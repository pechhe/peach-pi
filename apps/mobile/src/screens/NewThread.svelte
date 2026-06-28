<script lang="ts">
  import { onMount } from "svelte";
  import type { RemoteProjectInfo, RemoteSessionInfo } from "@peach-pi/shared-types";
  import { store } from "../lib/store.svelte.ts";
  import { listProjects, createThread, createChat } from "../lib/api.ts";
  import Icon from "../components/Icon.svelte";

  let { masterId }: { masterId: string } = $props();
  const master = $derived(store.master(masterId));

  let loading = $state(false);
  let creating = $state<string | null>(null);
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

  /** `key` keeps the spinner bound to the exact row tapped (local, a specific
   *  worktree, or a fresh worktree for project P) so only that row shows the
   *  spinner and a second tap can't race a duplicate. */
  async function start(key: string, fn: () => Promise<RemoteSessionInfo>): Promise<void> {
    if (creating) return;
    creating = key;
    error = "";
    try {
      open(await fn());
    } catch (e) {
      error = (e as Error).message;
      creating = null;
    }
  }

  function startLocal(p: RemoteProjectInfo): void {
    start(`local:${p.id}`, () => createThread(master!, p.id));
  }
  function startNewWorktree(p: RemoteProjectInfo): void {
    start(`wt-new:${p.id}`, () => createThread(master!, p.id, { worktree: true }));
  }
  function startInWorktree(p: RemoteProjectInfo, wtId: string): void {
    start(`wt:${wtId}`, () => createThread(master!, p.id, { worktreeId: wtId }));
  }
  function startChat(): void {
    start("chat", () => createChat(master!));
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

  {#if loading && projects.length === 0}
    <div class="flex items-center justify-center gap-2 py-16 text-[13px] text-faint">
      <span class="text-accent"><Icon name="spinner" size={16} sw={3} /></span> Loading projects…
    </div>
  {:else}
    <div class="flex flex-col gap-2.5">
      {#each projects as p (p.id)}
        {@const hasWorktrees = p.worktrees.length > 0}
        <div
          class="rounded-[14px] border bg-surface p-3.5 {hasWorktrees ? 'border-border-strong' : 'border-border'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="shrink-0 text-accent"><Icon name="folder" size={18} sw={1.7} /></span>
            <span class="flex-1 truncate text-[14px] font-semibold">{p.name}</span>
            {#if hasWorktrees}
              <span class="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                <Icon name="box" size={10} sw={2} />{p.worktrees.length} worktree{p.worktrees.length > 1 ? "s" : ""}
              </span>
            {:else}
              <span class="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-faint">local only</span>
            {/if}
          </div>

          <!-- Start modes -->
          <div class="mt-2.5 flex flex-col gap-2">
            <button
              class="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left disabled:opacity-50"
              onclick={() => startLocal(p)}
              disabled={creating !== null}
            >
              {#if creating === `local:${p.id}`}
                <span class="shrink-0 text-accent"><Icon name="spinner" size={15} sw={3} /></span>
              {:else}
                <span class="shrink-0 text-muted"><Icon name="git-branch" size={15} sw={1.8} /></span>
              {/if}
              <div class="flex-1">
                <div class="text-[13px] font-semibold">Local</div>
                <div class="text-[10.5px] text-faint">Run in the project's main checkout</div>
              </div>
            </button>

            {#if hasWorktrees}
              <!-- Existing worktrees: each its own start row. -->
              {#each p.worktrees as w (w.id)}
                <button
                  class="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left disabled:opacity-50"
                  onclick={() => startInWorktree(p, w.id)}
                  disabled={creating !== null}
                >
                  {#if creating === `wt:${w.id}`}
                    <span class="shrink-0 text-accent"><Icon name="spinner" size={15} sw={3} /></span>
                  {:else}
                    <span class="shrink-0 text-accent"><Icon name="box" size={15} sw={1.8} /></span>
                  {/if}
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[13px] font-semibold">{w.name}</div>
                    <div class="truncate font-mono text-[10px] text-faint">{w.dir}</div>
                  </div>
                </button>
              {/each}
            {/if}

            <button
              class="flex items-center gap-2.5 rounded-xl border border-dashed border-border-strong bg-surface-2/50 px-3 py-2.5 text-left disabled:opacity-50"
              onclick={() => startNewWorktree(p)}
              disabled={creating !== null}
            >
              {#if creating === `wt-new:${p.id}`}
                <span class="shrink-0 text-accent"><Icon name="spinner" size={15} sw={3} /></span>
              {:else}
                <span class="shrink-0 text-accent"><Icon name="plus" size={15} sw={2.2} /></span>
              {/if}
              <div class="flex-1">
                <div class="text-[13px] font-semibold">New worktree</div>
                <div class="text-[10.5px] text-faint">Fresh isolated checkout + branch</div>
              </div>
            </button>
          </div>
        </div>
      {/each}

      <button
        class="mt-1 flex items-center gap-3 rounded-[14px] border border-border bg-surface-2 p-3.5 text-left"
        onclick={startChat}
        disabled={creating !== null}
      >
        {#if creating === "chat"}
          <span class="shrink-0 text-muted"><Icon name="spinner" size={18} sw={3} /></span>
        {:else}
          <span class="shrink-0 text-muted"><Icon name="message" size={18} sw={1.7} /></span>
        {/if}
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
