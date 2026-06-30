<script lang="ts">
  // Attachment chips shelf (images, text blobs, generic files). Extracted from
  // Composer.svelte (issue #55). Opens the lightbox / text viewer via the
  // existing stores; removal is delegated to the host (draft mutation).
  import type { ComposerAttachment } from "../../lib/composer/attachments";
  import FileText from "@lucide/svelte/icons/file-text";
  import X from "@lucide/svelte/icons/x";
  import { lightbox } from "../../stores/lightbox.svelte";
  import { textViewer } from "../../stores/text-viewer.svelte";

  let {
    attachments,
    onRemove,
  }: {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
  } = $props();
</script>

{#if attachments.length > 0}
  <div class="mb-2 flex flex-wrap gap-2" data-testid="attachment-shelf">
    {#each attachments as att (att.id)}
      <div class="group relative">
        {#if att.kind === "image"}
          <button
            type="button"
            class="block cursor-zoom-in"
            onclick={() => lightbox.open(`data:${att.mimeType};base64,${att.data}`)}
            title="Click to enlarge"
          >
            <img
              src={`data:${att.mimeType};base64,${att.data}`}
              alt={att.name}
              class="h-16 w-16 rounded-lg border border-border-strong object-cover"
            />
          </button>
        {:else if att.kind === "text"}
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft hover:bg-surface-2"
            title="Click to view"
            onclick={() => textViewer.open(att.name, att.kind === "text" ? att.content : "")}
          >
            <FileText size={13} />
            <span class="max-w-40 truncate">{att.name}</span>
          </button>
        {:else}
          <div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft">
            <FileText size={13} />
            <span class="max-w-40 truncate">{att.name}</span>
          </div>
        {/if}
        <button
          class="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-surface-3 text-[10px] text-fg group-hover:flex hover:bg-danger"
          onclick={() => onRemove(att.id)}><X size={10} /></button
        >
      </div>
    {/each}
  </div>
{/if}
