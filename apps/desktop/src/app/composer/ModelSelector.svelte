<script lang="ts">
  import type { ModelInfo } from "@peach-pi/shared-types";
  import { SvelteSet } from "svelte/reactivity";

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

  const keyOf = (provider: string, id: string) => `${provider}:${id}`;
  function shortLabel(label: string): string {
    return label
      .replace(/^claude\s+/i, "Claude ")
      .replace(/^gpt-?5/i, "GPT-5")
      .replace(/\s+/g, " ")
      .trim();
  }

  let open = $state(false);
  let filter = $state("");
  let pinnedKeys = $state<string[]>([]);
  let visualKey = $state<string | undefined>(undefined);
  let hiddenKeys = new SvelteSet<string>();
  let showHidden = $state(false);

  // Default the three pinned slots to the first three models.
  $effect(() => {
    if (pinnedKeys.length === 0 && models.length > 0) {
      pinnedKeys = models.slice(0, 3).map((m) => keyOf(m.provider, m.id));
    }
  });
  // Clear optimistic key once it matches the real selection.
  $effect(() => {
    if (visualKey && model && visualKey === keyOf(model.provider, model.id)) visualKey = undefined;
  });

  const pinnedOptions = $derived.by(() => {
    const byKey = new Map(models.map((m) => [keyOf(m.provider, m.id), m]));
    const picked: ModelInfo[] = [];
    for (const k of pinnedKeys) {
      const m = byKey.get(k);
      if (m) picked.push(m);
    }
    for (const m of models) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p.provider === m.provider && p.id === m.id)) picked.push(m);
    }
    return picked.slice(0, 3);
  });

  const activeKey = $derived(visualKey ?? (model ? keyOf(model.provider, model.id) : undefined));
  const overflowOption = $derived.by(() => {
    if (!activeKey || pinnedOptions.some((m) => keyOf(m.provider, m.id) === activeKey)) return undefined;
    return models.find((m) => keyOf(m.provider, m.id) === activeKey);
  });
  const sliderOptions = $derived(overflowOption ? [...pinnedOptions, overflowOption] : pinnedOptions);
  const activeSliderIndex = $derived(sliderOptions.findIndex((m) => keyOf(m.provider, m.id) === activeKey));
  const sliderPosition = $derived(activeSliderIndex >= 0 ? activeSliderIndex : 1);

  const visibleModels = $derived(
    showHidden || hiddenKeys.size === 0 ? models : models.filter((m) => !hiddenKeys.has(keyOf(m.provider, m.id))),
  );
  const filteredModels = $derived.by(() => {
    if (!filter) return visibleModels;
    const q = filter.toLowerCase();
    return visibleModels.filter(
      (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  });
  const grouped = $derived.by(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of filteredModels) {
      const arr = groups.get(m.provider);
      if (arr) arr.push(m);
      else groups.set(m.provider, [m]);
    }
    return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
  });
  const hiddenCount = $derived(models.length - visibleModels.length);

  function toggleMenu() {
    open = !open;
    if (open) onRequestModels();
  }

  function selectModel(m: ModelInfo) {
    visualKey = keyOf(m.provider, m.id);
    open = false;
    if (m.provider === model?.provider && m.id === model?.id) return;
    onPick(m.provider, m.id);
  }

  function pinModelOut(m: ModelInfo, slot: number) {
    const key = keyOf(m.provider, m.id);
    if (pinnedKeys.includes(key)) return;
    const next = pinnedOptions.map((p) => keyOf(p.provider, p.id));
    next[Math.max(0, Math.min(2, slot))] = key;
    pinnedKeys = next;
  }

  // Imperative handles for composer keyboard shortcuts (⌘1–3 slots, ⌘4 menu).
  export function selectSlot(index: number) {
    const option = pinnedOptions[index];
    if (option) selectModel(option);
  }
  export function openMenu() {
    if (!open) toggleMenu();
  }
</script>

<svelte:document
  onmousedown={(e) => {
    if (open && !(e.target as HTMLElement)?.closest?.(".model-selector")) open = false;
  }}
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = false;
  }}
/>

<span class="model-selector">
  <span class="model-selector__anchor" data-section-label="Model">
    <span class="composer__key-mount">
      <span
        class="model-selector__badge model-selector__badge--slider"
        data-physical-key="model"
        aria-expanded={open}
        style="--model-slider-position: {sliderPosition}"
      >
        <span class="model-selector__slider" aria-hidden="true">
          <span class="model-selector__slider-ticks">
            <span class="model-selector__slider-tick model-selector__slider-tick--0"></span>
            <span class="model-selector__slider-tick model-selector__slider-tick--1"></span>
            <span class="model-selector__slider-tick model-selector__slider-tick--2"></span>
            <span class="model-selector__slider-tick model-selector__slider-tick--3"></span>
          </span>
          <span class="model-selector__slider-track">
            <span class="model-selector__slider-rail"></span>
            <span class="model-selector__slider-glow"></span>
          </span>
          <span class="model-selector__slider-thumb"></span>
        </span>

        {#each sliderOptions as option, index (keyOf(option.provider, option.id))}
          {@const isActive = keyOf(option.provider, option.id) === activeKey}
          <button
            class="model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-{index}{isActive
              ? ' model-selector__slider-label--selected'
              : ''}"
            type="button"
            title={`Switch to ${option.name}`}
            data-testid={index === 0 ? "model-selector" : undefined}
            onclick={() => {
              if (index === 3 && isActive) toggleMenu();
              else selectModel(option);
            }}
          >
            {shortLabel(option.name)}
          </button>
        {/each}

        {#if sliderOptions.length < 4}
          <button
            class="model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-3 model-selector__slider-label--menu"
            type="button"
            aria-label="Open full model menu"
            aria-expanded={open}
            data-testid="model-menu-toggle"
            onclick={toggleMenu}
          >…</button>
        {/if}
      </span>
    </span>

    {#if open}
      <div class="model-selector__dropdown" data-testid="model-menu" onwheel={(e) => e.stopPropagation()}>
        <div class="model-selector__filter">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="model-selector__filter-input"
            placeholder="Filter models..."
            bind:value={filter}
            autofocus
          />
        </div>
        {#each grouped as group (group.provider)}
          <div>
            <div class="model-selector__group-title">{group.provider}</div>
            {#each group.items as option (keyOf(option.provider, option.id))}
              {@const isActive = option.provider === model?.provider && option.id === model?.id}
              <div
                class="model-selector__item{isActive ? ' model-selector__item--active' : ''}"
                role="button"
                tabindex="0"
                onclick={() => selectModel(option)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectModel(option))}
              >
                <span class="model-selector__item-label">{option.name}</span>
                {#if isActive}<span class="model-selector__item-meta">active</span>{/if}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                <span
                  class="model-selector__item-actions"
                  role="group"
                  onclick={(e) => e.stopPropagation()}
                >
                  {#each [0, 1, 2] as slot (slot)}
                    <button
                      class="model-selector__item-slot"
                      type="button"
                      tabindex="-1"
                      title={`Keep in position ${slot + 1}`}
                      onclick={() => pinModelOut(option, slot)}
                    >{slot + 1}</button>
                  {/each}
                  <button
                    class="model-selector__item-hide"
                    type="button"
                    tabindex="-1"
                    title="Hide from model menu"
                    onclick={() => hiddenKeys.add(keyOf(option.provider, option.id))}
                  >hide</button>
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="model-selector__group-title">No models</div>
        {/each}
        {#if hiddenCount > 0 || showHidden}
          <button
            class="model-selector__show-hidden"
            type="button"
            onclick={() => {
              if (showHidden) {
                hiddenKeys.clear();
                showHidden = false;
              } else {
                showHidden = true;
              }
            }}
          >{showHidden ? "Hide all" : `Show hidden (${hiddenCount})`}</button>
        {/if}
      </div>
    {/if}
  </span>
</span>
