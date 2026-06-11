<script lang="ts">
  import { onMount } from "svelte";
  import { snapshot } from "../stores/snapshot.svelte";
  import { transcripts } from "../stores/transcripts.svelte";
  import Sidebar from "./Sidebar.svelte";
  import ThreadView from "./ThreadView.svelte";

  let selectedThreadId = $state<string | null>(null);

  const selectedThread = $derived(
    snapshot.current?.threads.find((t) => t.id === selectedThreadId) ?? null,
  );

  onMount(() => {
    transcripts.init();
    void snapshot.init();
  });
</script>

<div class="flex h-full">
  {#if snapshot.current}
    <Sidebar
      projects={snapshot.current.projects}
      threads={snapshot.current.threads}
      {selectedThreadId}
      onSelect={(id) => (selectedThreadId = id)}
    />
    {#if selectedThread}
      <ThreadView thread={selectedThread} />
    {:else}
      <main class="flex flex-1 items-center justify-center" data-testid="boot-ok">
        <div class="titlebar-drag absolute inset-x-0 top-0 h-12"></div>
        <p class="text-sm text-zinc-600">
          {snapshot.current.projects.length} projects · {snapshot.current.threads.length} threads —
          select or create a thread
        </p>
      </main>
    {/if}
  {:else}
    <main class="flex flex-1 items-center justify-center">
      <p class="text-sm text-zinc-600">Loading…</p>
    </main>
  {/if}
</div>
