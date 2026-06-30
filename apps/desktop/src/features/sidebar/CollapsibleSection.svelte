<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import MovingHighlight from "../../app/MovingHighlight.svelte";
  import ThreadRow from "./ThreadRow.svelte";
  import { sidebarStore } from "./sidebar.svelte";

  let {
    key,
    label,
    list,
    variant,
  }: {
    key: string;
    label: string;
    list: Thread[];
    variant: "snoozed" | "toTest" | "archived";
  } = $props();

  const doneAutos = $derived(sidebarStore.isDoneKey(key));
</script>

{#if list.length > 0}
  <button
    class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] text-fainter hover:text-muted"
    onclick={() => sidebarStore.toggle(key)}
  >
    {#if sidebarStore.expanded[key]}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
    {label} · {list.length}
  </button>
  <div
    class="done-panel"
    class:done-panel--open={sidebarStore.expanded[key]}
    class:done-panel--animated={!sidebarStore.reduceMotion}
    onpointerenter={() => doneAutos && sidebarStore.expanded[key] && sidebarStore.clearDoneHide(key)}
    onpointerleave={() => doneAutos && sidebarStore.expanded[key] && sidebarStore.startDoneHide(key)}
  >
    <div class="done-panel__inner">
      {#if sidebarStore.expanded[key]}
        <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active">
          {#each list as thread (thread.id)}
            <ThreadRow {thread} {variant} />
          {/each}
        </MovingHighlight>
      {/if}
    </div>
  </div>
{/if}
