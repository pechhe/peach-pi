<script lang="ts">
  import { onMount } from "svelte";
  import { Select } from "../../../components/ui/select";
  import { settingsModels, keyOf } from "../models-store.svelte";

  onMount(() => {
    void settingsModels.load();
  });

  async function onPick(key: string) {
    await settingsModels.pickUtilityModel(key);
  }
</script>

<div>
  <h2 class="text-sm text-fg">Utility model</h2>
  <p class="text-xs text-faint">
    Background tasks like thread titles and commit messages use this fast,
    inexpensive model. Choose from your scoped models (same as the
    composer). Leave on “Default” to auto-pick.
  </p>
</div>
<Select
  class="mt-3 w-full rounded-md bg-surface-2"
  value={settingsModels.selectedKey}
  onValueChange={onPick}
  items={[
    { value: "", label: "Default (auto-pick)" },
    ...settingsModels.grouped.flatMap((group) =>
      group.items.map((m) => ({ value: keyOf(m), label: m.name, group: group.provider })),
    ),
  ]}
  data-testid="utility-model-select"
  aria-label="Utility model"
/>
