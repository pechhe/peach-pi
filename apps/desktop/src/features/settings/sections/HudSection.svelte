<script lang="ts">
  import { api } from "../../../lib/ipc";
  import { snapshot } from "../../../stores/snapshot.svelte";

  const hudAutoReveal = $derived(snapshot.current?.ui.hudAutoRevealOnFinish ?? false);
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">HUD auto-reveal</h2>
    <p class="text-xs text-faint">Expand the HUD chat when its own thread finishes.</p>
  </div>
  <input
    type="checkbox"
    checked={hudAutoReveal}
    onchange={(e) => api.invoke("hud:setAutoReveal", e.currentTarget.checked)}
    data-testid="settings-hud-auto-reveal"
  />
</div>
