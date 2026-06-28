<script lang="ts">
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import { extensionUi } from "../stores/extension-ui.svelte";

  let {
    text,
    label = "Copy",
    class: klass = "",
  }: { text: string; label?: string; class?: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        copied = false;
      }, 1500);
      extensionUi.notify("Copied");
    });
  }
</script>

<button
  type="button"
  class="copy-btn {klass}"
  onclick={copy}
  title={copied ? "Copied" : label}
  aria-label={copied ? "Copied" : label}
>
  {#if copied}
    <Check size={13} />
    <span>Copied</span>
  {:else}
    <Copy size={13} />
    <span>{label}</span>
  {/if}
</button>
