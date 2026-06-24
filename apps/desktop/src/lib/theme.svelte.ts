/**
 * Applied-theme store. A theme is a set of semantic color tokens redefined
 * under `:root[data-theme="…"]` in styles/app.css. Switching just sets the
 * `data-theme` attribute on <html>.
 *
 * Persisted to localStorage (same convention as sound-prefs). The `storage`
 * event keeps every window in sync, so the choice is global across the app.
 *
 * Custom themes: a user can override individual color tokens. Overrides live
 * under `:root[data-custom="true"]` injected via a single <style> node, layered
 * on top of the matching base preset (dark→"default", light→"light") so the
 * underlying palette resolves correctly even before any token is overridden.
 * Switching to a preset removes the `data-custom` flag, so overrides become
 * inert with zero leak. Custom state (scheme + overrides) is persisted
 * separately from the selected preset id, so switching presets never discards
 * your edits.
 *
 * Pure catalog + override helpers (no runes, unit-tested) live in
 * `./theme-tokens.ts` and are re-exported here for app consumers.
 */

export {
  THEMES,
  CUSTOM_THEME_ID,
  PRIMARY_SLOTS,
  STATUS_SLOTS,
  DEVICE_SLOTS,
  HEX_RE,
  buildCustomCss,
  isSavedId,
  makeSavedId,
  isValidThemeName,
  type ThemeOption,
  type CustomPrimaries,
  type PrimaryKey,
  type SavedTheme,
  type Scheme,
} from "./theme-tokens";
import {
  CUSTOM_THEME_ID,
  THEMES,
  buildCustomCss,
  isSavedId,
  makeSavedId,
  isValidThemeName,
  type CustomPrimaries,
  type PrimaryKey,
  type SavedTheme,
  type Scheme,
} from "./theme-tokens";

const KEY = "peachpi:theme";
const DEFAULT_THEME = "default";

/** Serialized custom theme: `{ scheme, primaries }` where primaries holds up
 *  to three hex overrides (bg / fg / accent). */
const CUSTOM_KEY = "peachpi:custom-theme";
/** User-named saved themes: `SavedTheme[]`. */
const SAVED_KEY = "peachpi:saved-themes";
const CUSTOM_STYLE_ID = "peachpi-custom-theme";

interface StoredCustom {
  scheme: Scheme;
  primaries: CustomPrimaries;
}

function readStored(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && (id === CUSTOM_THEME_ID || isSavedId(id) || THEMES.some((t) => t.id === id))) {
      return id;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

/** Read + sanitize the user's saved themes from localStorage. */
function readStoredSaved(): SavedTheme[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t): t is SavedTheme =>
        t && typeof t === "object" &&
        typeof t.id === "string" && isSavedId(t.id) &&
        typeof t.name === "string" &&
        (t.scheme === "light" || t.scheme === "dark") &&
        t.primaries && typeof t.primaries === "object",
      )
      .map((t) => ({
        id: t.id,
        name: t.name,
        scheme: t.scheme,
        primaries: sanitizePrimaries(t.primaries),
      }));
  } catch {
    return [];
  }
}

function sanitizePrimaries(inP: unknown): CustomPrimaries {
  const out: CustomPrimaries = {};
  if (inP && typeof inP === "object") {
    for (const k of ["bg", "fg", "accent", "warning", "danger", "metalDye", "screen", "screenText", "engraveActive"] as (keyof CustomPrimaries)[]) {
      const v = (inP as Record<string, unknown>)[k];
      if (typeof v === "string" && v) out[k] = v;
    }
  }
  return out;
}

function findSaved(id: string): SavedTheme | undefined {
  return savedThemes.find((t) => t.id === id);
}

function readStoredCustom(): StoredCustom {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return { scheme: "dark", primaries: {} };
    const parsed = JSON.parse(raw) as Partial<StoredCustom>;
    const inP = parsed.primaries ?? {};
    const primaries: CustomPrimaries = {};
    for (const k of ["bg", "fg", "accent", "warning", "danger", "metalDye", "screen", "screenText", "engraveActive"] as (keyof CustomPrimaries)[]) {
      const v = (inP as Record<string, unknown>)[k];
      if (typeof v === "string" && v) primaries[k] = v;
    }
    return {
      scheme: parsed.scheme === "light" ? "light" : "dark",
      primaries,
    };
  } catch {
    return { scheme: "dark", primaries: {} };
  }
}

function schemeFor(id: string): Scheme {
  if (id === CUSTOM_THEME_ID) return customScheme;
  const saved = findSaved(id);
  if (saved) return saved.scheme;
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

/** Single injected <style> node for custom token overrides. Created lazily,
 *  kept around across preset switches (it's inert when `data-custom` is gone). */
function customStyleNode(): HTMLStyleElement {
  let el = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = CUSTOM_STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

/** Resolve the primaries to inject for the given active theme id: the saved
 *  theme's primaries if a saved theme is active, else the working draft. */
function activePrimaries(id: string): CustomPrimaries {
  if (isSavedId(id)) return findSaved(id)?.primaries ?? {};
  return customPrimaries;
}

/** Refresh the injected <style> content from the active theme's primaries. */
function syncCustomStyle(id: string): void {
  customStyleNode().textContent = buildCustomCss(activePrimaries(id));
}

function applyToDocument(id: string): void {
  if (id === CUSTOM_THEME_ID || isSavedId(id)) {
    // Custom / saved overlay token overrides on a base preset so the underlying
    // palette resolves correctly even before any token is overridden (a light
    // custom with no overrides reads as light, not the dark @theme default).
    // `data-custom` gates the injected override <style>.
    document.documentElement.dataset.theme =
      schemeFor(id) === "light" ? "light" : "default";
    document.documentElement.dataset.custom = "true";
    syncCustomStyle(id);
  } else {
    document.documentElement.dataset.theme = id;
    delete document.documentElement.dataset.custom;
  }
  // Expose the light/dark scheme separately so theme-agnostic styling (e.g.
  // the composer device's anodized-black variant) can key off it without
  // enumerating every theme id.
  document.documentElement.dataset.scheme = schemeFor(id);
  // color-scheme drives native scrollbars/form controls. Presets set this in
  // app.css; the custom theme has no CSS rule, so set it inline in all cases
  // (same value the CSS would for presets → no visible change there).
  document.documentElement.style.colorScheme = schemeFor(id);
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

// Module-level mirrors of the custom-theme $state, read by the plain
// functions above (applyToDocument / syncCustomStyle / schemeFor). Kept in
// sync by the store's setters — same pattern as `composerStyle`.
let customScheme: Scheme = "dark";
let customPrimaries: CustomPrimaries = {};
let savedThemes: SavedTheme[] = [];

class ThemeStore {
  current = $state(DEFAULT_THEME);
  composer = $state<ComposerStyle>("auto");

  /** The 3 primary colors defining the custom working draft (each optional). */
  customPrimaries = $state<CustomPrimaries>({});
  /** Light/dark scheme for the custom draft (presets carry their own). */
  customScheme = $state<Scheme>("dark");
  /** User-named, persisted themes. */
  savedThemes = $state<SavedTheme[]>([]);

  composerOptions = COMPOSER_OPTIONS;

  /** Apply the persisted theme to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.current = readStored();
    this.composer = readComposerStyle();
    composerStyle = this.composer;
    const custom = readStoredCustom();
    this.customScheme = custom.scheme;
    customScheme = custom.scheme;
    this.customPrimaries = custom.primaries;
    customPrimaries = custom.primaries;
    this.savedThemes = readStoredSaved();
    savedThemes = this.savedThemes;
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
      if (e.key === CUSTOM_KEY && e.newValue !== null) {
        const c = readStoredCustom();
        this.customScheme = c.scheme;
        customScheme = c.scheme;
        this.customPrimaries = c.primaries;
        customPrimaries = c.primaries;
      }
      if (e.key === SAVED_KEY) {
        this.savedThemes = readStoredSaved();
        savedThemes = this.savedThemes;
      }
      applyToDocument(this.current);
    });
  }

  /** Select a preset, a saved theme, or the custom draft. */
  set(id: string): void {
    this.current = id;
    applyToDocument(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }

  /** Override one primary (bg / fg / accent) on the ACTIVE custom-or-saved
   *  theme. Editing a saved theme mutates it in place and persists; editing
   *  the draft flips from a preset to `custom`. Derived families regenerate. */
  setPrimary(key: keyof CustomPrimaries, hex: string): void {
    if (isSavedId(this.current)) {
      const next = this.savedThemes.map((t) =>
        t.id === this.current ? { ...t, primaries: { ...t.primaries, [key]: hex } } : t,
      );
      this.savedThemes = next;
      savedThemes = next;
      this.persistSaved();
      applyToDocument(this.current);
      return;
    }
    this.customPrimaries = { ...this.customPrimaries, [key]: hex };
    customPrimaries = this.customPrimaries;
    this.persistCustom();
    syncCustomStyle(this.current);
    if (this.current !== CUSTOM_THEME_ID) {
      this.current = CUSTOM_THEME_ID;
      applyToDocument(CUSTOM_THEME_ID);
      try {
        localStorage.setItem(KEY, CUSTOM_THEME_ID);
      } catch {
        /* ignore */
      }
    }
  }

  /** Clear one primary on the active custom-or-saved theme. */
  resetPrimary(key: keyof CustomPrimaries): void {
    if (isSavedId(this.current)) {
      const next = { ...this.customPrimaries };
      delete next[key];
      const updated = this.savedThemes.map((t) =>
        t.id === this.current ? { ...t, primaries: next } : t,
      );
      this.savedThemes = updated;
      savedThemes = updated;
      this.persistSaved();
      applyToDocument(this.current);
      return;
    }
    const next = { ...this.customPrimaries };
    delete next[key];
    this.customPrimaries = next;
    customPrimaries = next;
    this.persistCustom();
    syncCustomStyle(this.current);
  }

  /** Clear all primaries on the active custom-or-saved theme. Saved themes
   *  stay selected (now equal to the base palette). */
  resetAll(): void {
    if (isSavedId(this.current)) {
      const updated = this.savedThemes.map((t) =>
        t.id === this.current ? { ...t, primaries: {} } : t,
      );
      this.savedThemes = updated;
      savedThemes = updated;
      this.persistSaved();
      applyToDocument(this.current);
      return;
    }
    this.customPrimaries = {};
    customPrimaries = this.customPrimaries;
    this.persistCustom();
    syncCustomStyle(this.current);
  }

  /** Set the light/dark scheme of the active custom-or-saved theme. */
  setCustomScheme(scheme: Scheme): void {
    if (isSavedId(this.current)) {
      const updated = this.savedThemes.map((t) =>
        t.id === this.current ? { ...t, scheme } : t,
      );
      this.savedThemes = updated;
      savedThemes = updated;
      this.persistSaved();
      applyToDocument(this.current);
      return;
    }
    this.customScheme = scheme;
    customScheme = scheme;
    this.persistCustom();
    if (this.current === CUSTOM_THEME_ID) {
      applyToDocument(CUSTOM_THEME_ID);
    }
  }

  /** Snapshot the working draft into a new named saved theme and activate
   *  it. Returns the new id (empty string on invalid name). */
  save(name: string): string {
    const trimmed = name.trim();
    if (!isValidThemeName(trimmed)) return "";
    const id = makeSavedId(trimmed);
    const t: SavedTheme = {
      id,
      name: trimmed,
      scheme: this.customScheme,
      primaries: { ...this.customPrimaries },
    };
    const next = [...this.savedThemes, t];
    this.savedThemes = next;
    savedThemes = next;
    this.persistSaved();
    this.current = id;
    applyToDocument(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
    return id;
  }

  /** Rename the actively-selected saved theme. No-op for presets / draft. */
  renameActive(name: string): void {
    if (!isSavedId(this.current) || !isValidThemeName(name)) return;
    const trimmed = name.trim();
    const updated = this.savedThemes.map((t) =>
      t.id === this.current ? { ...t, name: trimmed } : t,
    );
    this.savedThemes = updated;
    savedThemes = updated;
    this.persistSaved();
  }

  /** Delete a saved theme by id. If it was active, fall back to the default
   *  preset (its overrides leave the DOM the moment `data-custom` is cleared). */
  deleteSaved(id: string): void {
    if (!isSavedId(id)) return;
    const next = this.savedThemes.filter((t) => t.id !== id);
    this.savedThemes = next;
    savedThemes = next;
    this.persistSaved();
    if (this.current === id) {
      this.set(DEFAULT_THEME);
    }
  }

  private persistCustom(): void {
    try {
      localStorage.setItem(
        CUSTOM_KEY,
        JSON.stringify({ scheme: this.customScheme, primaries: this.customPrimaries }),
      );
    } catch {
      /* ignore */
    }
  }

  private persistSaved(): void {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(this.savedThemes));
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
