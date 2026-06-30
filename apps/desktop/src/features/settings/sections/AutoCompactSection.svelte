<script lang="ts">
  import { onMount } from "svelte";
  import { autoCompact } from "../../../stores/auto-compact.svelte";

  onMount(() => {
    void autoCompact.load();
  });

  function saveAutoCompactPercent(e: Event) {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    const percent = Math.min(100, Math.max(1, Math.round(value)));
    void autoCompact.set({ percent, tokens: autoCompact.tokens });
  }

  function saveAutoCompactTokens(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    const tokens = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
    void autoCompact.set({ percent: autoCompact.percent, tokens });
  }
</script>

<div>
  <h2 class="text-sm text-fg">Auto-compaction</h2>
  <p class="text-xs text-faint">
    Conversations compact automatically once context usage crosses either
    threshold — whichever is reached first. Leave the token cap blank to
    trigger on percentage alone.
  </p>
</div>
<div class="mt-3 flex flex-col gap-3">
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Context used (%)</span>
    <input
      type="number"
      min="1"
      max="100"
      value={autoCompact.percent}
      onchange={saveAutoCompactPercent}
      class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
      data-testid="auto-compact-percent"
      aria-label="Auto-compact percentage"
    />
  </label>
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Token count</span>
    <input
      type="number"
      min="0"
      step="1000"
      placeholder="none"
      value={autoCompact.tokens ?? ""}
      onchange={saveAutoCompactTokens}
      class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
      data-testid="auto-compact-tokens"
      aria-label="Auto-compact token count"
    />
  </label>
</div>
