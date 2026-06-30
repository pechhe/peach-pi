<script lang="ts">
  import { Select } from "../../../components/ui/select";
  import { TEST_SOUND_OPTIONS } from "../../../lib/sound/test-sound";
  import { settingsSounds } from "../sounds-store.svelte";
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Test bench sound</h2>
    <p class="text-xs text-faint">The cue played when you mark a thread for testing (the Eye action).</p>
  </div>
  <div class="flex items-center gap-2">
    <Select
      class="rounded-md bg-surface-2"
      value={settingsSounds.testVariant}
      onValueChange={(v) => settingsSounds.pickTest(v)}
      items={TEST_SOUND_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
      data-testid="test-sound-select"
      aria-label="Test bench sound"
    />
    <button
      class="settings-btn rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
      onclick={() => settingsSounds.previewTest()}
      disabled={settingsSounds.muted}
      data-testid="test-sound-preview"
    >Play</button>
  </div>
</div>
<p class="mt-2 text-xs text-fainter">
  {TEST_SOUND_OPTIONS.find((o) => o.id === settingsSounds.testVariant)?.description}
</p>
