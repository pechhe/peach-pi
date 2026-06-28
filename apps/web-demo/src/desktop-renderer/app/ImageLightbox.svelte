<script lang="ts">
  import { lightbox } from "../stores/lightbox.svelte";

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && lightbox.src) {
      e.preventDefault();
      lightbox.close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if lightbox.src}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    style="padding-left: var(--content-left, 0px)"
    role="button"
    tabindex="0"
    aria-label="Close enlarged image"
    onclick={() => lightbox.close()}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && lightbox.close()}
    data-testid="image-lightbox"
  >
    <img
      src={lightbox.src}
      alt="Enlarged attachment"
      class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
    />
  </div>
{/if}
