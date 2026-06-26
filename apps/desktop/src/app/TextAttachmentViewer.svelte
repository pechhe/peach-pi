<script lang="ts">
  // Global text-attachment viewer. The composer calls `textViewer.open(name,
  // content)` for a pasted-text attachment; we render it in the shared animated
  // markdown dialog (InstructionsDialog).
  import { textViewer } from "../stores/text-viewer.svelte";
  import InstructionsDialog from "./InstructionsDialog.svelte";

  let open = $state(false);

  // Store → local open. When the store opens, raise the dialog.
  $effect(() => {
    if (textViewer.name !== null) open = true;
  });
  // Local → store. When the dialog closes (Escape/backdrop/✕), clear the
  // store so name/content reset and a re-open is a fresh state.
  $effect(() => {
    if (!open && textViewer.name !== null) textViewer.close();
  });
</script>

<InstructionsDialog
  bind:open
  title={textViewer.name ?? ""}
  content={textViewer.content}
  testId="text-attachment-viewer"
/>
