<script lang="ts">
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import MovingHighlight from "../../app/MovingHighlight.svelte";
  import ThreadRow from "./ThreadRow.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import { sidebarStore } from "./sidebar.svelte";
  import { playButtonSecondary } from "../../lib/sound/button-click-sound";

  function newChat() {
    playButtonSecondary("click");
    sidebarStore.onNewChat();
  }
</script>

<div class="border-t border-border/60 px-3 pt-3 pb-3">
  <div class="flex items-center justify-between px-1 pb-1.5">
    <button
      class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase hover:text-muted {sidebarStore.chatActive ? 'engraved--active' : ''}"
      onclick={() => sidebarStore.toggleChatsCollapsed()}
      aria-label={sidebarStore.chatsCollapsed ? "Expand chats" : "Collapse chats"}
      aria-expanded={!sidebarStore.chatsCollapsed}
      data-testid="toggle-chats"
    >
      {#if sidebarStore.chatsCollapsed}<ChevronRight size={12} />{:else}<ChevronDown size={12} />{/if}
      <MessageSquare size={12} /> Chats
    </button>
    <button
      class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
      onclick={newChat}
      data-testid="new-chat"
      title="New chat"><Plus size={14} /></button
    >
  </div>
  <div
    class="done-panel"
    class:done-panel--open={!sidebarStore.chatsCollapsed}
    class:done-panel--animated={!sidebarStore.reduceMotion}
  >
    <div class="chats-scroll max-h-48 min-h-0 overflow-y-auto">
      <MovingHighlight itemSelector=".session-row" activeSelector=".session-row--active" previewSelector={sidebarStore.previewSelector}>
        {#each sidebarStore.chatGroups.active as thread (thread.id)}
          <ThreadRow thread={thread} variant="active" />
        {/each}
      </MovingHighlight>
      <CollapsibleSection key="chats:past" label="Done" list={sidebarStore.chatGroups.archived} variant="archived" />
    </div>
  </div>
</div>
