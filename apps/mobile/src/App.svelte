<script lang="ts">
  import { store } from "./lib/store.svelte.ts";
  import Masters from "./screens/Masters.svelte";
  import AddMaster from "./screens/AddMaster.svelte";
  import Sessions from "./screens/Sessions.svelte";
  import NewThread from "./screens/NewThread.svelte";
  import Transcript from "./screens/Transcript.svelte";

  const route = $derived(store.route);
</script>

<main class="flex h-full flex-col overflow-hidden bg-bg text-fg">
  {#key route.name + ("masterId" in route ? route.masterId : "") + ("threadId" in route ? route.threadId : "")}
    {#if route.name === "masters"}
      <Masters />
    {:else if route.name === "add-master"}
      <AddMaster />
    {:else if route.name === "sessions"}
      <Sessions masterId={route.masterId} />
    {:else if route.name === "new-thread"}
      <NewThread masterId={route.masterId} />
    {:else if route.name === "transcript"}
      <Transcript masterId={route.masterId} threadId={route.threadId} title={route.title} />
    {/if}
  {/key}
</main>

<style>
  main {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
