/**
 * Slash-command preferences: which commands the user has starred. Global UI
 * preference (not per-thread), persisted to localStorage with the same
 * convention as model-prefs.svelte.ts. The `storage` event keeps every window
 * in sync. A command is keyed `"<kind>:<name>"`.
 */

const STARRED_KEY = "peachpi:commandStarred";

function readArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

class CommandPrefsStore {
  starredKeys = $state<string[]>([]);
  private initialized = false;

  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.starredKeys = readArray(STARRED_KEY);
    window.addEventListener("storage", (e) => {
      if (e.key === STARRED_KEY) this.starredKeys = readArray(STARRED_KEY);
    });
  }

  isStarred(key: string): boolean {
    return this.starredKeys.includes(key);
  }

  toggle(key: string): void {
    this.starredKeys = this.starredKeys.includes(key)
      ? this.starredKeys.filter((k) => k !== key)
      : [...this.starredKeys, key];
    writeArray(STARRED_KEY, this.starredKeys);
  }
}

export const commandPrefs = new CommandPrefsStore();
