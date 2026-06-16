/**
 * Model selector preferences: which models occupy the three pinned composer
 * slots, and which models are hidden from the full menu. These are global UI
 * preferences (not per-thread), persisted to localStorage with the same
 * convention as theme.svelte.ts. The `storage` event keeps every window in
 * sync so the choice is global across the app.
 */

const PINNED_KEY = "peachpi:modelPinned";
const HIDDEN_KEY = "peachpi:modelHidden";

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

class ModelPrefsStore {
  pinnedKeys = $state<string[]>([]);
  hiddenKeys = $state<string[]>([]);
  private initialized = false;

  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.pinnedKeys = readArray(PINNED_KEY);
    this.hiddenKeys = readArray(HIDDEN_KEY);
    window.addEventListener("storage", (e) => {
      if (e.key === PINNED_KEY) this.pinnedKeys = readArray(PINNED_KEY);
      else if (e.key === HIDDEN_KEY) this.hiddenKeys = readArray(HIDDEN_KEY);
    });
  }

  setPinned(keys: string[]): void {
    this.pinnedKeys = keys;
    writeArray(PINNED_KEY, keys);
  }

  hide(key: string): void {
    if (this.hiddenKeys.includes(key)) return;
    this.hiddenKeys = [...this.hiddenKeys, key];
    writeArray(HIDDEN_KEY, this.hiddenKeys);
  }

  clearHidden(): void {
    this.hiddenKeys = [];
    writeArray(HIDDEN_KEY, []);
  }
}

export const modelPrefs = new ModelPrefsStore();
