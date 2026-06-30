<script lang="ts">
  import type { TranscriptItem } from "@peach-pi/shared-types";
  import MessageBadges from "../../app/MessageBadges.svelte";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import { parseSkillInvocation } from "../../lib/composer/skill-message";
  import { skillViewer } from "../../stores/skill-viewer.svelte";
  import { lightbox } from "../../stores/lightbox.svelte";
  import { sendPop } from "./lib/send-pop";

  let {
    item,
    currentMatchId,
    threadId,
    connLogos,
  }: {
    item: Extract<TranscriptItem, { kind: "user" }>;
    currentMatchId: string | null;
    threadId: string;
    connLogos: Map<string, string | null>;
  } = $props();
</script>

<div
  class="item-enter flex max-w-[85%] flex-col gap-2 self-end"
  data-item-id={item.id}
  class:thread-find-hit={item.id === currentMatchId}
  use:sendPop={threadId}
>
  {#if item.images && item.images.length > 0}
    <div class="flex flex-wrap justify-end gap-2">
      {#each item.images as img, i (i)}
        <button
          type="button"
          class="block cursor-zoom-in"
          onclick={() => lightbox.open(`data:${img.mimeType};base64,${img.data}`)}
          title="Click to enlarge"
        >
          <img
            src={`data:${img.mimeType};base64,${img.data}`}
            alt="Attached image"
            class="h-28 w-28 rounded-lg border border-border-strong/40 object-cover"
          />
        </button>
      {/each}
    </div>
  {/if}
  {#if item.text}
    <MessageBadges text={item.text} {connLogos}>
      {#snippet children({ body })}
        {@const skill = parseSkillInvocation(body)}
        {#if skill}
          <button
            type="button"
            class="skill-chip self-end"
            onclick={() => skillViewer.open(skill)}
            title="View skill"
            data-testid="skill-chip"
          >
            <BookOpen size={12} />
            <span>{skill.name}</span>
          </button>
          {#if skill.args}
            <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">
              {skill.args}
            </div>
          {/if}
        {:else if body}
          <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">
            {body}
          </div>
        {/if}
      {/snippet}
    </MessageBadges>
  {/if}
</div>
