import type { ModelInfo, VisionProxyConfig } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * pi-vision-proxy config (model + mode). The extension persists its config at
 * `~/.pi/agent/vision-proxy.json`, merged over built-in defaults on read.
 * Mirrors the pi-settings store pattern: flat $state primitives, load() once.
 */
class VisionProxyStore {
  installed = $state(false);
  /** Mode: fallback | always | off. Default reflects the extension default. */
  mode = $state<VisionProxyConfig["mode"]>("fallback");
  provider = $state("anthropic");
  modelId = $state("claude-sonnet-4-5");
  modeLocked = $state(false);
  modelLocked = $state(false);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const c = await api.invoke("app:getVisionProxyConfig");
    this.apply(c);
  }

  async setMode(mode: VisionProxyConfig["mode"]): Promise<void> {
    const c = await api.invoke("app:setVisionProxyMode", mode);
    this.apply(c);
  }

  async setModel(model: ModelInfo): Promise<void> {
    // Svelte 5 $state wraps the ModelInfo in a deep Proxy; Proxy exotic
    // objects are not structured-cloneable, so passing it straight through
    // ipcRenderer.invoke throws "object could not be cloned". Strip to a
    // plain object at the IPC boundary.
    const plain: ModelInfo = {
      provider: model.provider,
      id: model.id,
      name: model.name,
    };
    const c = await api.invoke("app:setVisionProxyModel", plain);
    this.apply(c);
  }

  async install(): Promise<{ ok: boolean; error?: string }> {
    const res = await api.invoke("app:installVisionProxy");
    if (res.ok) {
      // Refresh the installed flag so the UI flips out of the not-installed state.
      const installState = await api.invoke("app:getVisionProxyInstallState");
      this.installed = installState.installed;
    }
    return res;
  }

  private apply(c: VisionProxyConfig): void {
    this.installed = c.installed;
    this.mode = c.mode;
    this.provider = c.provider;
    this.modelId = c.modelId;
    this.modeLocked = c.modeLocked;
    this.modelLocked = c.modelLocked;
  }
}

export const visionProxy = new VisionProxyStore();
