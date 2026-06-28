<script lang="ts">
  import BookOpen from "@lucide/svelte/icons/book-open";
  import X from "@lucide/svelte/icons/x";
  import Markdown from "./Markdown.svelte";
  import { skillViewer } from "../stores/skill-viewer.svelte";
  import { clickCopy } from "../lib/code-copy";

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && skillViewer.skill) {
      e.preventDefault();
      skillViewer.close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if skillViewer.skill}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
    style="padding-left: var(--content-left, 0px)"
    role="button"
    tabindex="0"
    aria-label="Close skill"
    onclick={() => skillViewer.close()}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && skillViewer.close()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="flex max-h-full w-[min(48rem,100%)] flex-col rounded-xl border border-border-strong bg-surface shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      data-testid="skill-dialog"
    >
      <header class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <BookOpen size={15} class="text-accent" />
        <h2 class="text-sm font-medium text-fg">{skillViewer.skill.name}</h2>
        <button
          class="ml-auto rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
          onclick={() => skillViewer.close()}
          aria-label="Close"><X size={14} /></button
        >
      </header>
      <p class="shrink-0 px-4 pt-2 font-mono text-[11px] text-fainter break-all" use:clickCopy={skillViewer.skill.location}>
        {skillViewer.skill.location}
      </p>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px] text-fg-soft">
        <Markdown text={skillViewer.skill.body} />
      </div>
      {#if skillViewer.skill.args}
        <div class="shrink-0 border-t border-border px-4 py-3">
          <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-fainter">Arguments</p>
          <p class="text-[13px] whitespace-pre-wrap text-fg-soft">{skillViewer.skill.args}</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
