<script lang="ts">
  // Build/Plan mode switch. Extracted from Composer.svelte (issue #55).
  // Presentational: the click sound, captureEvent, and draft mutation stay in
  // the host's `toggleMode` so keyboard shortcuts (⌘B / ⌘P) and the button
  // share one path.
  let {
    mode,
    onToggle,
  }: {
    mode: "plan" | "build";
    onToggle: () => void;
  } = $props();
</script>

<span class="composer__key-mount composer__key-mount--mode">
  <button
    class="composer-mode {mode === 'plan' ? 'composer-mode--plan' : ''}"
    aria-pressed={mode === 'plan'}
    aria-label={`Composer mode: ${mode === 'plan' ? 'Plan' : 'Build'}`}
    onclick={onToggle}
    data-press="self"
    data-testid="mode-toggle"
    title="⌘B build · ⌘P plan"
  >
    <span class="composer-mode__label {mode !== 'plan' ? 'composer-mode__label--active' : ''}">Build</span>
    <span class="composer-mode__track" aria-hidden="true"><span class="composer-mode__thumb"></span></span>
    <span class="composer-mode__label {mode === 'plan' ? 'composer-mode__label--active' : ''}">Plan</span>
  </button>
</span>
