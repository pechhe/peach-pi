import type { PiSettings } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * Pi agent settings (retry, message delivery).
 * Persisted in ~/.pi/agent/settings.json by the main process.
 *
 * Each field is a flat $state primitive (matching the auto-compact pattern)
 * so Svelte 5 reactivity tracks reads/writes correctly.
 */
class PiSettingsStore {
  retryEnabled = $state(true);
  retryMaxRetries = $state(3);
  retryBaseDelayMs = $state(2000);
  steeringMode = $state<"all" | "one-at-a-time">("one-at-a-time");
  followUpMode = $state<"all" | "one-at-a-time">("one-at-a-time");
  autoUpdateExtensions = $state(true);
  insomnia = $state(false);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const s = await api.invoke("app:getPiSettings");
    this.apply(s);
  }

  async patch(update: Partial<PiSettings>): Promise<void> {
    const s = await api.invoke("app:setPiSettings", update);
    this.apply(s);
  }

  private apply(s: PiSettings): void {
    this.retryEnabled = s.retry.enabled;
    this.retryMaxRetries = s.retry.maxRetries;
    this.retryBaseDelayMs = s.retry.baseDelayMs;
    this.steeringMode = s.steeringMode;
    this.followUpMode = s.followUpMode;
    this.autoUpdateExtensions = s.autoUpdateExtensions;
    this.insomnia = s.insomnia;
  }
}

export const piSettings = new PiSettingsStore();
