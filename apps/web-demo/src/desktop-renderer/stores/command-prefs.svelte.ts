/**
 * Slash-command preferences: which commands the user has starred. Global UI
 * preference (not per-thread), persisted to localStorage with the same
 * convention as model-prefs.svelte.ts. The `storage` event keeps every window
 * in sync. A command is keyed `"<kind>:<name>"`.
 */

import { arrayPref } from "../lib/local-prefs";

const starred = arrayPref("peachpi:commandStarred");

class CommandPrefsStore {
  starredKeys = $state<string[]>([]);
  private initialized = false;

  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.starredKeys = starred.read();
    starred.sync(() => {
      this.starredKeys = starred.read();
    });
  }

  isStarred(key: string): boolean {
    return this.starredKeys.includes(key);
  }

  toggle(key: string): void {
    this.starredKeys = this.starredKeys.includes(key)
      ? this.starredKeys.filter((k) => k !== key)
      : [...this.starredKeys, key];
    starred.write(this.starredKeys);
  }
}

export const commandPrefs = new CommandPrefsStore();
