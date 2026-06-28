/**
 * Model selector preferences: which models occupy the three pinned composer
 * slots, and which models are hidden from the full menu. These are global UI
 * preferences (not per-thread), persisted to localStorage with the same
 * convention as theme.svelte.ts. The `storage` event keeps every window in
 * sync so the choice is global across the app.
 */

import { arrayPref } from "./local-prefs";

const pinned = arrayPref("peachpi:modelPinned");
const hidden = arrayPref("peachpi:modelHidden");

class ModelPrefsStore {
  pinnedKeys = $state<string[]>([]);
  hiddenKeys = $state<string[]>([]);
  private initialized = false;

  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.pinnedKeys = pinned.read();
    this.hiddenKeys = hidden.read();
    pinned.sync(() => {
      this.pinnedKeys = pinned.read();
    });
    hidden.sync(() => {
      this.hiddenKeys = hidden.read();
    });
  }

  setPinned(keys: string[]): void {
    this.pinnedKeys = keys;
    pinned.write(keys);
  }

  hide(key: string): void {
    if (this.hiddenKeys.includes(key)) return;
    this.hiddenKeys = [...this.hiddenKeys, key];
    hidden.write(this.hiddenKeys);
  }

  clearHidden(): void {
    this.hiddenKeys = [];
    hidden.write([]);
  }
}

export const modelPrefs = new ModelPrefsStore();
