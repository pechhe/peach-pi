<script lang="ts">
  import { onMount } from "svelte";
  import { Select } from "../../../components/ui/select";
  import type { VisionProxyConfig } from "@peach-pi/shared-types";
  import { clickCopy } from "../../../lib/code-copy";
  import { visionProxy } from "../../../stores/vision-proxy.svelte";
  import { settingsModels, keyOf } from "../models-store.svelte";

  /** provider:id for the selected vision model (matches the utility-model key shape). */
  const visionKey = $derived(`${visionProxy.provider}:${visionProxy.modelId}`);
  let installingVision = $state(false);
  let visionError = $state("");

  onMount(() => {
    void settingsModels.load();
    void visionProxy.load();
  });

  async function pickVisionModel(key: string) {
    if (visionProxy.modelLocked || !key) return;
    const model = settingsModels.byKey.get(key);
    if (!model) return;
    visionError = "";
    try {
      await visionProxy.setModel(model);
    } catch (err) {
      visionError = String(err);
    }
  }

  async function installVisionProxy() {
    if (installingVision || visionProxy.installed) return;
    installingVision = true;
    visionError = "";
    try {
      const res = await visionProxy.install();
      if (!res.ok) visionError = res.error ?? "Install failed.";
    } finally {
      installingVision = false;
    }
  }
</script>

<div class="mb-2">
  <h2 class="text-sm text-fg">Vision proxy</h2>
  <p class="text-xs text-faint">
    Routes images to a vision-capable model, collects descriptions, and
    injects them into the agent's context — so text-only models can
    "see" your images across turns. Requires restart after install.
  </p>
</div>

{#if !visionProxy.installed}
  <div class="flex items-center justify-between gap-3">
    <span class="text-xs text-faint">
      Not installed. Installs <code>npm:pi-vision-proxy</code> via pi.
    </span>
    <button
      class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
      onclick={installVisionProxy}
      disabled={installingVision}
      data-testid="install-vision-proxy"
    >
      {installingVision ? "Installing…" : "Install"}
    </button>
  </div>
  {#if visionError}
    <p class="mt-2 text-xs text-danger" data-testid="vision-proxy-error" use:clickCopy={visionError}>{visionError}</p>
  {/if}
{:else}
  <div class="flex flex-col gap-3">
    <div>
      <label class="mb-1 block text-xs text-fg">Vision model</label>
      <Select
        class="w-full rounded-md bg-surface-2"
        value={visionKey}
        onValueChange={pickVisionModel}
        disabled={visionProxy.modelLocked}
        items={settingsModels.grouped.flatMap((group) =>
          group.items.map((m) => ({ value: keyOf(m), label: m.name, group: group.provider })),
        )}
        data-testid="vision-model-select"
        aria-label="Vision model"
      />
      {#if visionProxy.modelLocked}
        <p class="mt-1 text-[11px] text-fainter">
          Locked by <code>PI_VISION_PROXY_MODEL</code> env var.
        </p>
      {/if}
    </div>
    <div>
      <label class="mb-1 block text-xs text-fg">Mode</label>
      <Select
        class="w-full rounded-md bg-surface-2"
        value={visionProxy.mode}
        onValueChange={(v) => visionProxy.setMode(v as VisionProxyConfig["mode"])}
        disabled={visionProxy.modeLocked}
        items={[
          { value: "fallback", label: "Fallback — only when active model can't see images" },
          { value: "always", label: "Always — always route through the proxy" },
          { value: "off", label: "Off — disabled" },
        ]}
        data-testid="vision-mode-select"
        aria-label="Vision proxy mode"
      />
      {#if visionProxy.modeLocked}
        <p class="mt-1 text-[11px] text-fainter">
          Locked by <code>PI_VISION_PROXY_MODE</code> env var.
        </p>
      {/if}
    </div>
    {#if visionError}
      <p class="text-xs text-danger" data-testid="vision-proxy-error" use:clickCopy={visionError}>{visionError}</p>
    {/if}
  </div>
{/if}
