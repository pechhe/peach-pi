<script lang="ts">
  import type { Project, ResourceInspection, ExtensionInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import { clickCopy } from "../lib/code-copy";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);

  $effect(() => {
    const target = scope;
    inspection = null;
    void api.invoke("resources:inspect", target).then((result) => (inspection = result));
  });

  // Remove/uninstall flow drives the Bits UI confirm dialog.
  let pending = $state<ExtensionInfo | null>(null);
  let dialogOpen = $state(false);
  let removing = $state(false);
  let dialogError = $state("");

  function startRemove(ext: ExtensionInfo) {
    if (!ext.removeSpec && !ext.deletePath) return;
    dialogError = "";
    pending = ext;
    dialogOpen = true;
  }

  async function confirmRemove() {
    const ext = pending;
    if (!ext || removing) return;
    removing = true;
    dialogError = "";
    try {
      const res = ext.removeSpec
        ? await api.invoke("extensions:remove", ext.removeSpec)
        : await api.invoke("extensions:deleteLocal", ext.deletePath!);
      if (res.ok) {
        dialogOpen = false;
        pending = null;
        inspection = await api.invoke("resources:inspect", scope);
      } else {
        dialogError = res.error ?? "Failed.";
      }
    } catch (err) {
      dialogError = String(err);
    } finally {
      removing = false;
    }
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="extensions-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-3 px-6">
    <h1 class="text-sm font-medium text-fg-soft">Extensions</h1>
    <Select
      class="rounded bg-surface px-2 py-0.5 text-xs"
      value={scope ?? ""}
      onValueChange={(v) => (scope = v || null)}
      items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
    />
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    {#if !inspection}
      <p class="text-xs text-fainter">Loading…</p>
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-2">
        {#each inspection.extensions as ext (ext.path)}
          <div
            class="rounded-lg border px-4 py-3
              {ext.error ? 'border-danger-border bg-danger-surface/30' : 'border-border bg-surface/50'}"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm text-fg">{ext.name}</span>
              <div class="flex items-center gap-3">
                <span class="text-[11px] text-faint">{ext.source}</span>
                {#if ext.removeSpec || ext.deletePath}
                  <button
                    class="rounded border border-border-strong px-2 py-0.5 text-[11px] text-faint hover:border-danger-border hover:text-danger disabled:opacity-50"
                    onclick={() => startRemove(ext)}
                    disabled={removing && pending?.path === ext.path}
                    title={ext.removeSpec ? `pi remove ${ext.removeSpec}` : `Delete ${ext.deletePath}`}
                    data-testid="remove-extension"
                  >
                    {removing && pending?.path === ext.path ? "Removing…" : ext.removeSpec ? "Uninstall" : "Delete"}
                  </button>
                {/if}
              </div>
            </div>
            <p class="mt-0.5 truncate font-mono text-[11px] text-fainter" use:clickCopy={ext.path}>{ext.path}</p>
            {#if ext.error}
              <p class="mt-1 text-xs text-danger" use:clickCopy={ext.error}>{ext.error}</p>
            {:else}
              <p class="mt-1 text-xs text-faint">
                {ext.tools.length} tools
                {#if ext.tools.length > 0}<span class="text-fainter"> · {ext.tools.join(", ")}</span>{/if}
                · {ext.commands.length} commands
                {#if ext.commands.length > 0}<span class="text-fainter"> · /{ext.commands.join(", /")}</span>{/if}
              </p>
            {/if}
          </div>
        {:else}
          <p class="text-xs text-fainter">No extensions found.</p>
        {/each}
        <p class="mt-2 text-[11px] text-fainter">
          Extensions load from ~/.pi/agent/extensions and each project's .pi/extensions. Packages
          uninstall via pi remove; local extensions are deleted from disk. Changes apply to new
          sessions.
        </p>
      </div>
    {/if}
  </div>

  <ConfirmDialog
    bind:open={dialogOpen}
    title={pending?.removeSpec ? `Uninstall ${pending?.name}?` : `Delete ${pending?.name}?`}
    description={pending?.removeSpec
      ? `Runs: pi remove ${pending.removeSpec}`
      : `Permanently deletes from disk:\n${pending?.deletePath ?? ""}`}
    confirmLabel={pending?.removeSpec ? "Uninstall" : "Delete"}
    destructive
    busy={removing}
    error={dialogError}
    onConfirm={confirmRemove}
  />
</main>
