/**
 * Theme registry + applied-theme store. A theme is a set of semantic color
 * tokens redefined under `:root[data-theme="…"]` in styles/app.css. Switching
 * just sets the `data-theme` attribute on <html>.
 *
 * Persisted to localStorage (same convention as sound-prefs). The `storage`
 * event keeps every window in sync, so the choice is global across the app.
 */

export interface ThemeOption {
  id: string;
  label: string;
  scheme: "dark" | "light";
}

export const THEMES: ThemeOption[] = [
  { id: "default", label: "Peach Dark", scheme: "dark" },
  { id: "light", label: "Light", scheme: "light" },
  { id: "dracula", label: "Dracula", scheme: "dark" },
  { id: "dracula-light", label: "Dracula Light", scheme: "light" },
];

const KEY = "peachpi:theme";
const DEFAULT_THEME = "default";

function readStored(): string {
  try {
    const id = localStorage.getItem(KEY);
    return id && THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyToDocument(id: string): void {
  document.documentElement.dataset.theme = id;
}

class ThemeStore {
  current = $state(DEFAULT_THEME);

  /** Apply the persisted theme to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.current = readStored();
    applyToDocument(this.current);
    // Cross-window sync: `storage` fires only in *other* documents of the
    // same origin, so a change in one window updates the rest.
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY || !e.newValue) return;
      this.current = e.newValue;
      applyToDocument(e.newValue);
    });
  }

  set(id: string): void {
    this.current = id;
    applyToDocument(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }
}

export const theme = new ThemeStore();
