<script lang="ts">
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  let {
    query = $bindable(),
    current,
    total,
    onNext,
    onPrev,
    onClose,
  }: {
    query: string;
    current: number;
    total: number;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
  } = $props();

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    inputEl?.focus();
    inputEl?.select();
  });

  export function focus() {
    inputEl?.focus();
    inputEl?.select();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  }
</script>

<div
  class="absolute top-3 right-4 z-30 flex items-center gap-1.5 rounded-xl border border-border-strong/70 bg-surface/95 py-1 pr-1.5 pl-2.5 shadow-xl ring-1 ring-black/5 backdrop-blur"
  data-testid="thread-find"
>
  <Search size={13} class="shrink-0 text-fainter" />
  <input
    bind:this={inputEl}
    bind:value={query}
    onkeydown={onKeydown}
    class="find-input w-44 appearance-none border-0 bg-transparent py-0.5 text-sm text-fg placeholder:text-fainter"
    placeholder="Find in thread…"
    data-testid="thread-find-input"
  />
  <span
    class="min-w-[2.75rem] shrink-0 text-right text-xs text-fainter tabular-nums"
    data-testid="thread-find-count"
  >
    {total ? `${current}/${total}` : query.trim() ? "0/0" : ""}
  </span>
  <div class="mx-0.5 h-5 w-px shrink-0 bg-border"></div>
  <button
    class="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg-soft disabled:pointer-events-none disabled:opacity-30"
    onclick={onPrev}
    disabled={total === 0}
    title="Previous (⇧⏎)"
  >
    <ChevronUp size={15} />
  </button>
  <button
    class="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg-soft disabled:pointer-events-none disabled:opacity-30"
    onclick={onNext}
    disabled={total === 0}
    title="Next (⏎)"
  >
    <ChevronDown size={15} />
  </button>
  <button
    class="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg-soft"
    onclick={onClose}
    title="Close (Esc)"
  >
    <X size={15} />
  </button>
</div>

<style>
  /* The app's global :focus-visible rule is unlayered and would otherwise
     paint a rounded outline box around this input; override it scoped. */
  .find-input:focus,
  .find-input:focus-visible {
    outline: none;
  }
</style>
