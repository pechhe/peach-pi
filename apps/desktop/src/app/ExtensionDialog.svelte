<script lang="ts">
  import type { ExtensionUiRequest } from "@peach-pi/shared-types";
  import { extensionUi } from "../stores/extension-ui.svelte";

  let { request }: { request: ExtensionUiRequest } = $props();

  let inputValue = $state("");
  let selectIndex = $state(0);

  function respond(value: string | boolean | undefined) {
    void extensionUi.respond(request.requestId, value);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") respond(undefined);
    if (request.kind === "select") {
      const options = request.options ?? [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectIndex = (selectIndex + 1) % options.length;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectIndex = (selectIndex - 1 + options.length) % options.length;
      }
      if (e.key === "Enter") respond(options[selectIndex]);
    }
    if (request.kind === "confirm" && e.key === "Enter") respond(true);
    if (request.kind === "input" && e.key === "Enter") respond(inputValue);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  <div
    class="w-96 rounded-xl border border-border-strong bg-surface p-4 shadow-2xl"
    data-testid="extension-dialog"
  >
    <h2 class="text-sm font-medium text-fg">{request.title}</h2>
    {#if request.message}
      <p class="mt-1 text-xs whitespace-pre-wrap text-muted">{request.message}</p>
    {/if}

    {#if request.kind === "select"}
      <div class="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border">
        {#each request.options ?? [] as option, i (option)}
          <button
            class="block w-full px-3 py-1.5 text-left text-sm
              {i === selectIndex ? 'bg-surface-2 text-fg' : 'text-muted'} hover:bg-surface-2"
            onclick={() => respond(option)}>{option}</button
          >
        {/each}
      </div>
      <div class="mt-3 flex justify-end">
        <button class="px-3 py-1.5 text-xs text-faint hover:text-fg-soft" onclick={() => respond(undefined)}>Cancel</button>
      </div>
    {:else if request.kind === "confirm"}
      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
          onclick={() => respond(false)}>No</button
        >
        <button
          class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg"
          onclick={() => respond(true)}>Yes</button
        >
      </div>
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="mt-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
        placeholder={request.placeholder ?? ""}
        bind:value={inputValue}
        autofocus
      />
      <div class="mt-3 flex justify-end gap-2">
        <button class="px-3 py-1.5 text-xs text-faint hover:text-fg-soft" onclick={() => respond(undefined)}>Cancel</button>
        <button
          class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg"
          onclick={() => respond(inputValue)}>OK</button
        >
      </div>
    {/if}
  </div>
</div>
