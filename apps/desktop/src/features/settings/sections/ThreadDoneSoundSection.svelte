<script lang="ts">
  import { Select } from "../../../components/ui/select";
  import { DONE_SOUND_OPTIONS } from "../../../lib/sound/done-sound";
  import { settingsSounds } from "../sounds-store.svelte";
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Thread done sound</h2>
    <p class="text-xs text-faint">The cue played when you mark a thread done (the archive action).</p>
  </div>
  <div class="flex items-center gap-2">
    <Select
      class="rounded-md bg-surface-2"
      value={settingsSounds.archiveVariant}
      onValueChange={(v) => settingsSounds.pickArchive(v)}
      items={DONE_SOUND_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
      data-testid="archive-sound-select"
      aria-label="Thread done sound"
    />
    <button
      class="settings-btn rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
      onclick={() => settingsSounds.previewArchive()}
      disabled={settingsSounds.muted}
      data-testid="archive-sound-preview"
    >Play</button>
  </div>
</div>
<p class="mt-2 text-xs text-fainter">
  {DONE_SOUND_OPTIONS.find((o) => o.id === settingsSounds.archiveVariant)?.description}
</p>
