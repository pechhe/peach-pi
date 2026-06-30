<script lang="ts">
  import { onMount } from "svelte";
  import { Switch } from "../../../components/ui/switch";
  import { piSettings } from "../../../stores/pi-settings.svelte";

  onMount(() => {
    void piSettings.load();
  });

  function toggleInsomnia() {
    void piSettings.patch({ insomnia: !piSettings.insomnia });
  }
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Keep awake while running</h2>
    <p class="text-xs text-faint">
      Prevent macOS idle sleep while an agent run is active. Releases the
      moment the run goes idle. Mac only.
    </p>
  </div>
  <Switch
    checked={piSettings.insomnia}
    onCheckedChange={toggleInsomnia}
    data-testid="insomnia-toggle"
    aria-label="Toggle keep awake"
  />
</div>
