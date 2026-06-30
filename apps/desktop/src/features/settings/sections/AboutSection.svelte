<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../../lib/ipc";

  let version = $state("");

  onMount(async () => {
    version = (await api.invoke("app:ping")).version;
  });
</script>

<h2 class="text-sm text-fg">About</h2>
<p class="mt-1 text-xs text-faint">peach-pi {version}</p>
