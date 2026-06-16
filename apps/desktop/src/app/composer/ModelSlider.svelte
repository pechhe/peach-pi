<script lang="ts">
  import type { ModelInfo } from "@peach-pi/shared-types";

  let {
    model,
    models,
    onPick,
    onRequestModels,
  }: {
    model: ModelInfo | null;
    models: ModelInfo[];
    onPick: (provider: string, id: string) => void;
    onRequestModels: () => void;
  } = $props();

  let menuOpen = $state(false);

  const index = $derived(
    model ? models.findIndex((m) => m.id === model.id && m.provider === model.provider) : -1,
  );
  const prev = $derived(index > 0 ? models[index - 1] : null);
  const next = $derived(index >= 0 && index < models.length - 1 ? models[index + 1] : null);

  function label(m: ModelInfo | null, fallback: string): string {
    return (m?.name ?? fallback).toUpperCase();
  }

  async function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = !menuOpen;
    if (menuOpen) onRequestModels();
  }

  function pick(m: ModelInfo) {
    onPick(m.provider, m.id);
  }
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<div class="control-anchor" data-label="Model">
  <div class="model-slider" data-testid="model-selector">
    <span class="model-slider__rail" aria-hidden="true"></span>
    <span class="model-slider__glow" aria-hidden="true"></span>
    <span class="model-slider__thumb" aria-hidden="true"></span>

    <button
      class="model-slider__label model-slider__label--prev"
      disabled={!prev}
      onclick={() => prev && pick(prev)}
      title={prev?.name}
    >{prev ? label(prev, "") : ""}</button>

    <span class="model-slider__label model-slider__label--active" title={model?.name}>
      {label(model, "model…")}
    </span>

    <button
      class="model-slider__label model-slider__label--next"
      disabled={!next}
      onclick={() => next && pick(next)}
      title={next?.name}
    >{next ? label(next, "") : ""}</button>

    <button
      class="model-slider__label model-slider__label--menu"
      onclick={toggleMenu}
      data-testid="model-menu-toggle"
      title="All models"
    >⋯</button>
  </div>

  {#if menuOpen}
    <div
      class="absolute right-0 bottom-full z-30 mb-2 max-h-64 w-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      data-testid="model-menu"
    >
      {#each models as m (`${m.provider}/${m.id}`)}
        <button
          class="flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs hover:bg-zinc-800
            {model?.id === m.id && model?.provider === m.provider ? 'text-zinc-100' : 'text-zinc-400'}"
          onclick={() => { pick(m); menuOpen = false; }}
        >
          <span class="truncate">{m.name}</span>
          <span class="ml-auto shrink-0 text-[10px] text-zinc-600">{m.provider}</span>
        </button>
      {:else}
        <p class="px-3 py-2 text-xs text-zinc-600">Loading…</p>
      {/each}
    </div>
  {/if}
</div>
