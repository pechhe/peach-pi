<script lang="ts">
  import { onMount } from "svelte";
  import { Select } from "../../../components/ui/select";
  import type { PiSettings } from "@peach-pi/shared-types";
  import { piSettings } from "../../../stores/pi-settings.svelte";

  onMount(() => {
    void piSettings.load();
  });

  function pickSteeringMode(value: string) {
    void piSettings.patch({ steeringMode: value as PiSettings["steeringMode"] });
  }

  function pickFollowUpMode(value: string) {
    void piSettings.patch({ followUpMode: value as PiSettings["followUpMode"] });
  }
</script>

<div>
  <h2 class="text-sm text-fg">Message delivery</h2>
  <p class="text-xs text-faint">How steering and follow-up messages are sent.</p>
</div>
<div class="mt-3 flex flex-col gap-3">
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Steering mode</span>
    <Select
      class="rounded-md bg-surface-2"
      value={piSettings.steeringMode}
      onValueChange={pickSteeringMode}
      items={[
        { value: "one-at-a-time", label: "One at a time" },
        { value: "all", label: "All" },
      ]}
      data-testid="steering-mode-select"
      aria-label="Steering mode"
    />
  </label>
  <label class="flex items-center justify-between gap-4">
    <span class="text-xs text-fg">Follow-up mode</span>
    <Select
      class="rounded-md bg-surface-2"
      value={piSettings.followUpMode}
      onValueChange={pickFollowUpMode}
      items={[
        { value: "one-at-a-time", label: "One at a time" },
        { value: "all", label: "All" },
      ]}
      data-testid="followup-mode-select"
      aria-label="Follow-up mode"
    />
  </label>
</div>
