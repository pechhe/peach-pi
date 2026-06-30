<script lang="ts">
  import { onMount } from "svelte";
  import { Select } from "../../../components/ui/select";
  import { caveman } from "../../../stores/caveman.svelte";

  onMount(() => {
    void caveman.load();
  });

  function pickCavemanLevel(value: string) {
    void caveman.setLevel(value);
  }
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Caveman intensity</h2>
    <p class="text-xs text-faint">Level the composer caveman toggle maps to when on.</p>
  </div>
  <Select
    class="rounded-md bg-surface-2"
    value={caveman.level}
    onValueChange={pickCavemanLevel}
    items={[
      { value: "full", label: "Full" },
      { value: "ultra", label: "Ultra" },
    ]}
    data-testid="caveman-level-select"
    aria-label="Caveman intensity"
  />
</div>
