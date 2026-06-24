import type { ScopedModel } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * Global model scoping (pi's `enabledModels` in settings.json). Mirrors the
 * composer's "All" → "+ scope" toggle, exposed here so the Settings view can
 * manage scope without a thread. An empty scope means every model is
 * implicitly scoped (pi `/model`) — surfaced as all-scoped in the UI.
 */
class ScopedModelsStore {
  models = $state<ScopedModel[]>([]);
  private loaded = false;

  init(): void {
    // Another window/session changed the scope — reload so Settings stays live.
    api.on("event:scopeChanged", () => {
      void this.load(true);
    });
  }

  async load(force = false): Promise<void> {
    if (!force && this.loaded && this.models.length > 0) return;
    this.loaded = true;
    this.models = await api.invoke("app:listScopedModels");
  }

  async toggle(provider: string, id: string, scoped: boolean): Promise<void> {
    this.models = await api.invoke("app:setModelScoped", provider, id, scoped);
  }
}

export const scopedModels = new ScopedModelsStore();
