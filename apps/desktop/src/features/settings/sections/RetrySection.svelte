<script lang="ts">
  import { onMount } from "svelte";
  import { Switch } from "../../../components/ui/switch";
  import { piSettings } from "../../../stores/pi-settings.svelte";

  onMount(() => {
    void piSettings.load();
  });

  /** Total retry wait time with exponential backoff: base * (2^n - 1). */
  const retryTotalSeconds = $derived.by(() => {
    if (piSettings.retryMaxRetries <= 0) return 0;
    const totalMs = piSettings.retryBaseDelayMs * (Math.pow(2, piSettings.retryMaxRetries) - 1);
    return Math.round(totalMs / 1000);
  });

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  function toggleRetryEnabled() {
    void piSettings.patch({ retry: { enabled: !piSettings.retryEnabled, maxRetries: piSettings.retryMaxRetries, baseDelayMs: piSettings.retryBaseDelayMs, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }

  function saveRetryCount(e: Event) {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    void piSettings.patch({ retry: { enabled: piSettings.retryEnabled, maxRetries: Math.max(0, Math.min(10, Math.round(value))), baseDelayMs: piSettings.retryBaseDelayMs, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }

  function saveRetryDelay(e: Event) {
    const seconds = Number((e.currentTarget as HTMLInputElement).value);
    const ms = Math.max(500, Math.round(seconds * 1000));
    void piSettings.patch({ retry: { enabled: piSettings.retryEnabled, maxRetries: piSettings.retryMaxRetries, baseDelayMs: ms, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }
</script>

<div>
  <h2 class="text-sm text-fg">Retry on error</h2>
  <p class="text-xs text-faint">
    When a request fails (network drop, transient error), pi retries with
    exponential backoff — each wait doubles.
  </p>
</div>
<div class="mt-3 flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-xs text-fg">Enabled</span>
    <Switch
      checked={piSettings.retryEnabled}
      onCheckedChange={toggleRetryEnabled}
      data-testid="retry-enabled-toggle"
      aria-label="Toggle retry"
    />
  </div>
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Retries</span>
    <input
      type="number"
      min="0"
      max="10"
      value={piSettings.retryMaxRetries}
      onchange={saveRetryCount}
      class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
      data-testid="retry-count"
      aria-label="Number of retries"
    />
  </label>
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Initial wait (seconds)</span>
    <input
      type="number"
      min="0.5"
      step="0.5"
      value={piSettings.retryBaseDelayMs / 1000}
      onchange={saveRetryDelay}
      class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
      data-testid="retry-initial-delay"
      aria-label="Initial wait seconds"
    />
  </label>
  {#if piSettings.retryMaxRetries > 0}
    <div class="rounded-md bg-surface-2 px-3 py-2 text-xs text-faint">
      <span class="text-fg-soft">Total retry window:</span>
      {formatDuration(retryTotalSeconds)}
      <span class="text-faint">
        ({piSettings.retryMaxRetries} retries,
        {piSettings.retryBaseDelayMs / 1000}s → {piSettings.retryBaseDelayMs / 1000 * Math.pow(2, piSettings.retryMaxRetries - 1)}s)
      </span>
    </div>
  {/if}
</div>
