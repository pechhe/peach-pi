<script lang="ts">
  import Radio from "@lucide/svelte/icons/radio";
  import MovingHighlight from "../../app/MovingHighlight.svelte";
  import ThreadRow from "./ThreadRow.svelte";
  import { sidebarStore } from "./sidebar.svelte";
</script>

{#each sidebarStore.remoteGroups as group (group.id)}
  <div class="border-t border-border/60 px-3 pt-3 pb-3">
    <div class="flex items-center justify-between px-1 pb-1.5">
      <span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
        <Radio size={12} /> {group.name}
      </span>
    </div>
    <div class="max-h-64 overflow-y-auto">
      {#each group.projects as proj (proj.name)}
        <div class="px-1.5 pt-1 pb-0.5 text-[10px] font-medium tracking-wide text-fainter uppercase">{proj.name}</div>
        <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" previewSelector={sidebarStore.previewSelector}>
          {#each proj.threads as thread (thread.id)}
            <ThreadRow thread={thread} variant="active" />
          {/each}
        </MovingHighlight>
      {/each}
    </div>
  </div>
{/each}
