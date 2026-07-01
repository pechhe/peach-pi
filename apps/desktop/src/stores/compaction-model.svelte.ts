import type { ModelInfo } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * The model used for smart auto-compaction summaries. Persisted in main as
 * `smartCompact.summaryModel` in ~/.pi/agent/settings.json (read by the
 * `pi-smart-compact` extension); null = use the active session model. The
 * Auto-compaction Settings section renders a scoped-models Select over this.
 */
class CompactionModelStore {
  selected = $state<ModelInfo | null>(null);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.selected = await api.invoke("app:getCompactionModel");
  }

  async set(model: ModelInfo | null): Promise<void> {
    // Svelte 5 $state wraps the ModelInfo in a deep Proxy; Proxy exotic
    // objects are not structured-cloneable, so strip to a plain object at the
    // IPC boundary (same fix as vision-proxy.svelte.ts).
    const plain: ModelInfo | null = model
      ? { provider: model.provider, id: model.id, name: model.name }
      : null;
    this.selected = await api.invoke("app:setCompactionModel", plain);
  }
}

export const compactionModel = new CompactionModelStore();
