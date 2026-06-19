import { api } from "../lib/ipc";

/**
 * Caveman compression toggle. Global default (from ~/.pi/agent/caveman.json)
 * lights the LED; clicking flips it and runs `/caveman` in the live session so
 * the change takes effect immediately, then persists the default.
 */
class CavemanStore {
  enabled = $state(false);
  level = $state("full");
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const state = await api.invoke("app:getCavemanState");
    this.enabled = state.enabled;
    this.level = state.level;
  }

  async toggle(threadId: string): Promise<void> {
    const next = !this.enabled;
    this.enabled = next; // optimistic
    const state = await api.invoke("app:setCavemanEnabled", next);
    this.enabled = state.enabled;
    this.level = state.level;
    // Apply to the live session immediately.
    await api.invoke("threads:runCommand", threadId, next ? `/caveman ${state.level}` : "/caveman off");
  }

  /** Persist the on-level the composer toggle maps to. */
  async setLevel(level: string): Promise<void> {
    const state = await api.invoke("app:setCavemanLevel", level);
    this.enabled = state.enabled;
    this.level = state.level;
  }
}

export const caveman = new CavemanStore();
