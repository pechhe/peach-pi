import type { AutoCompactSettings } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * Auto-compaction thresholds. Persisted in main (KV) and enforced there after
 * each run; the renderer mirrors them to drive the Settings form and the
 * context-bar marker.
 */
class AutoCompactStore {
  percent = $state(80);
  tokens = $state<number | null>(null);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const s = await api.invoke("app:getAutoCompact");
    this.percent = s.percent;
    this.tokens = s.tokens;
  }

  async set(settings: AutoCompactSettings): Promise<void> {
    const saved = await api.invoke("app:setAutoCompact", settings);
    this.percent = saved.percent;
    this.tokens = saved.tokens;
  }
}

export const autoCompact = new AutoCompactStore();
