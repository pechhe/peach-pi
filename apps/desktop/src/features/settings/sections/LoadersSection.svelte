<script lang="ts">
  import DotMatrixPlayground from "../../../app/DotMatrixPlayground.svelte";
</script>

<div class="mb-3">
  <h2 class="text-sm text-fg">Dot matrix loaders</h2>
  <p class="text-xs text-faint">
    Curate which spinners appear where. Square → chat, Hex → sidebar, Triangle → agents.
    A random loader from the selected set is picked each time one appears.
  </p>
</div>
<DotMatrixPlayground />
