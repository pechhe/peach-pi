<script lang="ts">
  import type { ModelInfo, ScopedModel, ThinkingLevel } from "@peach-pi/shared-types";
  import Icon from "./Icon.svelte";

  let {
    models,
    selected,
    thinking,
    availableThinking,
    onSelectModel,
    onSetThinking,
    onClose,
  }: {
    models: ScopedModel[];
    selected: ModelInfo | null;
    thinking: ThinkingLevel;
    availableThinking: ThinkingLevel[];
    onSelectModel: (m: ModelInfo) => void;
    onSetThinking: (t: ThinkingLevel) => void;
    onClose: () => void;
  } = $props();

  // Only auth-configured (scoped) models are pickable; the rest are greyed.
  const scoped = $derived(models.filter((m) => m.scoped));
  let query = $state("");

  const THINKING_LABEL: Record<ThinkingLevel, string> = {
    off: "Off",
    minimal: "Min",
    low: "Low",
    medium: "Med",
    high: "High",
    xhigh: "Max",
  };
  const THINKING_ORDER: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

  const filtered = $derived(
    scoped.filter((m) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
    }),
  );

  const levels = $derived.by(() => {
    const set = new Set(availableThinking.length ? availableThinking : THINKING_ORDER);
    const ordered = THINKING_ORDER.filter((l) => set.has(l));
    return ordered.length ? ordered : (["off"] as ThinkingLevel[]);
  });
  const thinkingIdx = $derived(levels.indexOf(thinking));

  function cycle(): void {
    if (!levels.length) return;
    const next = levels[(thinkingIdx + 1) % levels.length] ?? "off";
    onSetThinking(next);
  }

  function isSelected(m: ScopedModel): boolean {
    return selected?.provider === m.provider && selected?.id === m.id;
  }

  function modelShort(m: ModelInfo | null): string {
    if (!m) return "default";
    return m.name || m.id;
  }
</script>

<!-- Bottom sheet backdrop -->
<div
  class="fixed inset-0 z-40 bg-black/40"
  role="presentation"
  onclick={onClose}
></div>

<div class="pp-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[78vh] rounded-t-2xl border-t border-border bg-bg shadow-2xl">
  <!-- Grabber -->
  <div class="flex justify-center pt-2 pb-1">
    <span class="h-1 w-9 rounded-full bg-border-strong"></span>
  </div>

  <div class="flex items-center justify-between px-4 pb-2">
    <h2 class="text-[15px] font-semibold">Model & reasoning</h2>
    <button class="-mr-1 text-faint" onclick={onClose} aria-label="Close">
      <Icon name="x" size={20} sw={2} />
    </button>
  </div>

  <!-- Thinking cycle row (Codex-mobile style: a single tappable control) -->
  <button
    class="mx-3 mb-2 flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left"
    onclick={cycle}
  >
    <span class="flex flex-col">
      <span class="text-[11px] font-medium uppercase tracking-wide text-fainter">Reasoning</span>
      <span class="text-[13px] font-medium text-fg">
        {THINKING_LABEL[levels[Math.max(0, thinkingIdx)] ?? "off"]}
      </span>
    </span>
    <span class="flex items-center gap-1 text-[11px] text-faint">
      <Icon name="refresh" size={12} sw={2.5} />
      tap to cycle
    </span>
  </button>

  <!-- Search -->
  <div class="px-3">
    <input
      bind:value={query}
      placeholder="Search models…"
      class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-fg outline-none placeholder:text-fainter"
    />
  </div>

  <!-- List -->
  <div class="max-h-[42vh] overflow-y-auto px-2 py-2">
    {#each filtered as m (m.provider + "/" + m.id)}
      <button
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors {isSelected(m)
          ? 'bg-accent/10'
          : 'hover:bg-surface-2'}"
        onclick={() => onSelectModel({ provider: m.provider, id: m.id, name: m.name })}
      >
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-[14px] font-medium text-fg">{m.name}</span>
          <span class="truncate text-[11px] text-faint">{m.provider} · {m.id}</span>
        </span>
        {#if isSelected(m)}
          <span class="shrink-0 text-accent"><Icon name="check" size={16} sw={2.4} /></span>
        {/if}
      </button>
    {:else}
      <p class="px-3 py-6 text-center text-[13px] text-fainter">
        {scoped.length === 0 ? "No models configured on the master" : "No matches"}
      </p>
    {/each}
  </div>
</div>
