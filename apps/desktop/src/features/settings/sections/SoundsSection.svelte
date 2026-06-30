<script lang="ts">
  import { Switch } from "../../../components/ui/switch";
  import { settingsSounds } from "../sounds-store.svelte";
</script>

<div class="flex items-center justify-between">
  <div>
    <h2 class="text-sm text-fg">Sounds</h2>
    <p class="text-xs text-faint">Button clicks and the done chime.</p>
  </div>
  <Switch
    checked={!settingsSounds.muted}
    onCheckedChange={() => settingsSounds.toggleMuted()}
    data-testid="sounds-toggle"
    aria-label="Toggle sounds"
  />
</div>
