<script lang="ts">
  import { onMount } from "svelte";
  import { Switch } from "../../../components/ui/switch";
  import { api } from "../../../lib/ipc";
  import { piSettings } from "../../../stores/pi-settings.svelte";

  onMount(() => {
    void piSettings.load();
  });

  function toggleAutoUpdateExtensions() {
    void piSettings.patch({ autoUpdateExtensions: !piSettings.autoUpdateExtensions });
  }

  let updatingExtensions = $state(false);
  async function updateExtensionsNow() {
    if (updatingExtensions) return;
    updatingExtensions = true;
    try {
      await api.invoke("app:updateExtensions");
    } finally {
      updatingExtensions = false;
    }
  }
</script>

<div>
  <h2 class="text-sm text-fg">Extensions</h2>
  <p class="text-xs text-faint">
    Keep installed pi packages up to date by running
    <code>pi update --extensions</code> on launch and periodically. Runs
    only while no thread is active; restart to load new versions.
  </p>
</div>
<div class="mt-3 flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-xs text-fg">Auto-update</span>
    <Switch
      checked={piSettings.autoUpdateExtensions}
      onCheckedChange={toggleAutoUpdateExtensions}
      data-testid="auto-update-extensions-toggle"
      aria-label="Toggle extension auto-update"
    />
  </div>
  <button
    class="settings-btn self-start rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
    onclick={updateExtensionsNow}
    disabled={updatingExtensions}
    data-testid="update-extensions-now"
  >
    {updatingExtensions ? "Updating…" : "Update now"}
  </button>
</div>
