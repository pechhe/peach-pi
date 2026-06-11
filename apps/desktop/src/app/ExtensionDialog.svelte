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
    class="w-96 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
    data-testid="extension-dialog"
  >
    <h2 class="text-sm font-medium text-zinc-200">{request.title}</h2>
    {#if request.message}
      <p class="mt-1 text-xs whitespace-pre-wrap text-zinc-400">{request.message}</p>
    {/if}

    {#if request.kind === "select"}
      <div class="mt-3 max-h-60 overflow-y-auto rounded-lg border border-zinc-800">
        {#each request.options ?? [] as option, i (option)}
          <button
            class="block w-full px-3 py-1.5 text-left text-sm
              {i === selectIndex ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'} hover:bg-zinc-800"
            onclick={() => respond(option)}>{option}</button
          >
        {/each}
      </div>
      <div class="mt-3 flex justify-end">
        <button class="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300" onclick={() => respond(undefined)}>Cancel</button>
      </div>
    {:else if request.kind === "confirm"}
      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
          onclick={() => respond(false)}>No</button
        >
        <button
          class="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
          onclick={() => respond(true)}>Yes</button
        >
      </div>
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
        placeholder={request.placeholder ?? ""}
        bind:value={inputValue}
        autofocus
      />
      <div class="mt-3 flex justify-end gap-2">
        <button class="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300" onclick={() => respond(undefined)}>Cancel</button>
        <button
          class="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
          onclick={() => respond(inputValue)}>OK</button
        >
      </div>
    {/if}
  </div>
</div>
