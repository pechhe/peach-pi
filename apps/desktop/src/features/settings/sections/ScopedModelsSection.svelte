<script lang="ts">
  import { onMount } from "svelte";
  import ModelScopeSelect from "../../../components/ui/model-scope-select/model-scope-select.svelte";
  import { scopedModels } from "../../../stores/scoped-models.svelte";

  // The "open" state bubbles up to the shell, which deep-links it from the
  // `/scoped-models` palette command (the "open:scopedModels" sentinel).
  let { open = $bindable(false) }: { open?: boolean } = $props();

  onMount(() => {
    scopedModels.init();
    void scopedModels.load();
  });
</script>

<div class="flex items-center justify-between gap-4">
  <div class="min-w-0">
    <h2 class="text-sm text-fg">Scoped models</h2>
    <p class="text-xs text-faint">
      Which models appear in the composer selector. Shared with
      <code>pi /model</code> in <code>settings.json</code>.
    </p>
  </div>
  <ModelScopeSelect bind:open class="min-w-44" />
</div>
