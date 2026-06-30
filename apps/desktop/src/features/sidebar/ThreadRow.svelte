<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { api } from "../../lib/ipc";
  import { TAG_META } from "../../lib/tag-meta";
  import { doneAnim } from "../../lib/done-anim.svelte";
  import BrailleSpinner from "../../app/BrailleSpinner.svelte";
  import DoneBurst from "../../app/DoneBurst.svelte";
  import TestBurst from "../../app/TestBurst.svelte";
  import SnoozePicker from "../../app/SnoozePicker.svelte";
  import Tooltip from "../../app/Tooltip.svelte";
  import Radio from "@lucide/svelte/icons/radio";
  import BellRing from "@lucide/svelte/icons/bell-ring";
  import Clock from "@lucide/svelte/icons/clock";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import FlaskConicalOff from "@lucide/svelte/icons/flask-conical-off";
  import Check from "@lucide/svelte/icons/check";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { sidebarStore } from "./sidebar.svelte";

  let {
    thread,
    variant,
    worktreeName,
  }: {
    thread: Thread;
    variant: "active" | "snoozed" | "toTest" | "archived";
    worktreeName?: string;
  } = $props();

  const isActive = $derived(
    sidebarStore.activeView === "thread" && sidebarStore.selectedThreadId === thread.id,
  );
  const woke = $derived(variant === "active" && !!thread.wokeFromSnoozeAt);
  const Tag = $derived(TAG_META[thread.tag ?? "other"]);

  function toggleSnoozePicker(e: Event) {
    const btn = e.currentTarget as HTMLElement;
    sidebarStore.snoozePickerFor = sidebarStore.snoozePickerFor === thread.id ? null : thread.id;
    sidebarStore.snoozeAnchor = sidebarStore.snoozePickerFor ? btn : null;
  }
</script>

<div
  class="group relative flex items-center"
  style:z-index={sidebarStore.snoozePickerFor === thread.id ? 30 : undefined}
>
  {#if sidebarStore.doneAnimFor === thread.id}
    <DoneBurst ondone={() => sidebarStore.finishArchive(thread)} />
  {/if}
  {#if sidebarStore.testAnimFor === thread.id}
    <TestBurst ondone={() => sidebarStore.finishMarkToTest(thread)} />
  {/if}
  <button
    class="session-row flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-1.5 text-left text-[13px]
      {isActive ? 'session-row--active text-fg' : 'text-muted hover:text-fg'}"
    class:done-pop={sidebarStore.doneAnimFor === thread.id}
    class:done-pop--archiveSlide={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "archiveSlide"}
    class:done-pop--archiveSwipe={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "archiveSwipe"}
    class:done-pop--archiveShing={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "archiveShing"}
    class:done-pop--archiveVacuum={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "archiveVacuum"}
    class:done-pop--popSpark={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "popSpark"}
    class:done-pop--stamp={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "stamp"}
    class:done-pop--confetti={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "confetti"}
    class:done-pop--twos={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "twos"}
    class:done-pop--spring={sidebarStore.doneAnimFor === thread.id && doneAnim.current === "spring"}
    class:test-pop={sidebarStore.testAnimFor === thread.id}
    class:test-pop--testBench={sidebarStore.testAnimFor === thread.id}
    data-thread-id={thread.id}
    data-press="self"
    onclick={() => sidebarStore.selectThread(thread.id)}
  >
    {#if thread.remoteHostId}
      <Radio
        size={13}
        class="shrink-0 {thread.status === 'completed'
          ? 'text-accent'
          : thread.status === 'failed'
            ? 'text-danger'
            : 'text-faint'}"
        title="Remote session on {thread.remoteHostName ?? 'another machine'}"
      />
    {:else if woke}
      <BellRing
        size={13}
        class="shrink-0 text-warning"
        title="Woke from snooze"
        data-testid="woke-from-snooze-icon"
      />
    {:else}
      <Tag.icon
        size={13}
        class="shrink-0 {thread.status === 'completed'
          ? 'text-accent'
          : thread.status === 'failed'
            ? 'text-danger'
            : 'text-faint'}"
        title={thread.status === "failed" ? "Failed" : Tag.label}
      />
    {/if}
    <span
      class="truncate {variant === 'archived'
        ? 'text-fainter'
        : woke
          ? 'text-warning'
          : thread.status === 'failed'
            ? 'text-danger'
            : thread.status === 'completed' && !isActive
              ? 'text-accent'
              : ''}">{thread.title}</span>
    {#if worktreeName}
      <span class="shrink-0 truncate text-[10px] text-accent/60">· {worktreeName}</span>
    {/if}
    {#if thread.status === "running" || sidebarStore.fleetActiveIds.has(thread.id)}
      <BrailleSpinner class="session-spinner ml-auto mr-0 shrink-0" title="Thinking…" shape="hex" />
    {:else if variant === "active"}
      <span class="ml-auto shrink-0 text-[10px] text-fainter">{sidebarStore.relativeTime(thread.lastActivityAt, sidebarStore.now)}</span>
    {/if}
  </button>
  <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-surface group-hover:flex">
    {#if variant === "active"}
      <Tooltip text="Snooze">
        <button
          class="rounded p-1 text-faint hover:text-fg"
          data-snooze-toggle
          onclick={toggleSnoozePicker}
        ><Clock size={14} /></button>
      </Tooltip>
      <Tooltip text="Mark to test">
        <button
          class="rounded p-1 text-faint hover:text-fg"
          onclick={() => sidebarStore.markThreadToTest(thread)}
        ><FlaskConical size={14} /></button>
      </Tooltip>
      <Tooltip text="Done">
        <button
          class="rounded p-1 text-faint hover:text-fg"
          onclick={() => sidebarStore.archiveThread(thread)}
        ><Check size={14} /></button>
      </Tooltip>
    {:else if variant === "toTest"}
      <button
        class="rounded p-1 text-faint hover:text-fg"
        title="Unmark"
        onclick={() => api.invoke("threads:unmarkToTest", thread.id)}
      ><FlaskConicalOff size={14} /></button>
    {:else}
      <button
        class="rounded p-1 text-faint hover:text-fg"
        title="Restore"
        onclick={() => api.invoke("threads:unarchive", thread.id)}
      ><ArchiveRestore size={14} /></button>
      <button
        class="rounded p-1 text-faint hover:text-danger"
        title="Delete forever"
        onclick={() => api.invoke("threads:delete", thread.id)}
      ><Trash2 size={14} /></button>
    {/if}
  </div>
  {#if sidebarStore.snoozePickerFor === thread.id}
    <SnoozePicker
      anchor={sidebarStore.snoozeAnchor}
      onPick={(until) => {
        sidebarStore.snoozePickerFor = null;
        sidebarStore.snoozeAnchor = null;
        sidebarStore.snoozeThread(thread, until);
      }}
      onClose={() => {
        sidebarStore.snoozePickerFor = null;
        sidebarStore.snoozeAnchor = null;
      }}
    />
  {/if}
</div>
