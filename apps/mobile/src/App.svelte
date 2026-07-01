<script lang="ts">
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { store } from "./lib/store.svelte.ts";
  import Masters from "./screens/Masters.svelte";
  import AddMaster from "./screens/AddMaster.svelte";
  import Sessions from "./screens/Sessions.svelte";
  import NewThread from "./screens/NewThread.svelte";
  import Transcript from "./screens/Transcript.svelte";

  const route = $derived(store.route);

  // Edge-swipe-to-go-back: a left-gutter (≤28px) horizontal drag that travels
  // rightward past ~70px and stays mostly horizontal pops the stack. Only active
  // when there's somewhere to pop to (disabled on the root masters list, which
  // owns its own card swipe-to-delete). Pointer-based so it works with a mouse
  // in the simulator and a finger on-device.
  const EDGE = 28;
  const THRESH = 70;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onDown(e: PointerEvent): void {
    if (store.stack.length <= 1) return;
    if (e.clientX > EDGE) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }
  function onMove(e: PointerEvent): void {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = Math.abs(e.clientY - startY);
    if (dy > 44 && dx < dy) {
      // vertical scroll — abandon so we never hijack a vertical pan.
      tracking = false;
    } else if (dx > THRESH) {
      tracking = false;
      store.pop();
    }
  }
  function onUp(): void {
    tracking = false;
  }

  // Transition vector follows travel direction: forward → enter from the right,
  // backward (pop) → enter from the left. The outgoing screen unmounts
  // immediately; a one-sided slide is enough to feel native on a PWA.
  const enterX = $derived(store.dir === "forward" ? 48 : -48);
</script>

<svelte:window onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} />

<main class="flex h-full flex-col overflow-hidden bg-bg text-fg">
  {#key route.name + ("masterId" in route ? route.masterId : "") + ("threadId" in route ? route.threadId : "")}
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      in:fly={{ x: enterX, duration: 260, opacity: 1, easing: cubicOut }}
    >
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
    </div>
  {/key}
</main>

<style>
  main {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
