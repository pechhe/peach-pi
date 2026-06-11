<script lang="ts">
  import { onMount } from "svelte";
  import { snapshot } from "../stores/snapshot.svelte";
  import { api } from "../lib/ipc";

  let version = $state("");

  onMount(async () => {
    const [pong] = await Promise.all([api.invoke("app:ping"), snapshot.init()]);
    version = pong.version;
  });
</script>

<div class="flex h-full flex-col">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-center text-xs text-zinc-500">
    Peach Pi
  </header>
  <main class="flex flex-1 items-center justify-center">
    {#if snapshot.current}
      <div class="text-center" data-testid="boot-ok">
        <p class="text-lg font-medium">Peach Pi {version}</p>
        <p class="mt-1 text-sm text-zinc-500">
          {snapshot.current.projects.length} projects · {snapshot.current.threads.length} threads
        </p>
      </div>
    {:else}
      <p class="text-sm text-zinc-600">Loading…</p>
    {/if}
  </main>
</div>
