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

function schemeFor(id: string): "dark" | "light" {
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

function applyToDocument(id: string): void {
  document.documentElement.dataset.theme = id;
  // Expose the light/dark scheme separately so theme-agnostic styling (e.g.
  // the composer device's anodized-black variant) can key off it without
  // enumerating every theme id.
  document.documentElement.dataset.scheme = schemeFor(id);
  // Resolve the composer variant: "auto" defers to the current scheme.
  const resolved = composerStyle === "auto" ? schemeFor(id) : composerStyle;
  document.documentElement.dataset.composer = resolved;
}

// -------------------------------------------------------------------
// Composer appearance: "auto" (follow theme), "light" (silver), "dark"
// (anodized black).  Persisted separately from the theme so a user on a
// dark app theme can still opt for the silver composer if they prefer.
// -------------------------------------------------------------------
export type ComposerStyle = "auto" | "light" | "dark";
const COMPOSER_KEY = "peachpi:composer-style";
const COMPOSER_OPTIONS: { id: ComposerStyle; label: string }[] = [
  { id: "auto", label: "Auto (match theme)" },
  { id: "light", label: "Light (silver)" },
  { id: "dark", label: "Dark (anodized)" },
];

let composerStyle: ComposerStyle = "auto";

function readComposerStyle(): ComposerStyle {
  try {
    const v = localStorage.getItem(COMPOSER_KEY);
    return v === "light" || v === "dark" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

class ThemeStore {
  current = $state(DEFAULT_THEME);
  composer = $state<ComposerStyle>("auto");

  composerOptions = COMPOSER_OPTIONS;

  /** Apply the persisted theme to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.current = readStored();
    this.composer = readComposerStyle();
    composerStyle = this.composer;
    applyToDocument(this.current);
    // Cross-window sync: `storage` fires only in *other* documents of the
    // same origin, so a change in one window updates the rest.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY && e.newValue) {
        this.current = e.newValue;
      }
      if (e.key === COMPOSER_KEY && e.newValue) {
        this.composer = (e.newValue as ComposerStyle) || "auto";
        composerStyle = this.composer;
      }
      applyToDocument(this.current);
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

  setComposer(style: ComposerStyle): void {
    this.composer = style;
    composerStyle = style;
    applyToDocument(this.current);
    try {
      localStorage.setItem(COMPOSER_KEY, style);
    } catch {
      /* ignore */
    }
  }
}

export const theme = new ThemeStore();
