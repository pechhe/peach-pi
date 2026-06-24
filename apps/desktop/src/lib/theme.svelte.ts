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
  THEME_TOKENS,
  THEME_TOKEN_GROUPS,
  HEX_RE,
  buildCustomCss,
  type ThemeOption,
  type ThemeToken,
} from "./theme-tokens";
import { CUSTOM_THEME_ID, THEMES, buildCustomCss } from "./theme-tokens";

const KEY = "peachpi:theme";
const DEFAULT_THEME = "default";

/** Serialized custom theme: `{ scheme, colors }` where colors maps a token id
 *  (the part after `--color-`) to a hex override. */
const CUSTOM_KEY = "peachpi:custom-theme";
const CUSTOM_STYLE_ID = "peachpi-custom-theme";

type Scheme = "dark" | "light";

interface CustomTheme {
  scheme: Scheme;
  colors: Record<string, string>;
}

function readStored(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && (id === CUSTOM_THEME_ID || THEMES.some((t) => t.id === id))) {
      return id;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function readStoredCustom(): CustomTheme {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return { scheme: "dark", colors: {} };
    const parsed = JSON.parse(raw) as Partial<CustomTheme>;
    const colors =
      parsed.colors && typeof parsed.colors === "object"
        ? Object.fromEntries(
            Object.entries(parsed.colors).filter(
              ([k, v]) => typeof k === "string" && typeof v === "string",
            ),
          )
        : {};
    return {
      scheme: parsed.scheme === "light" ? "light" : "dark",
      colors,
    };
  } catch {
    return { scheme: "dark", colors: {} };
  }
}

function schemeFor(id: string): Scheme {
  if (id === CUSTOM_THEME_ID) return customScheme;
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

/** Refresh the injected <style> content from the current custom overrides. */
function syncCustomStyle(colors: Record<string, string>): void {
  customStyleNode().textContent = buildCustomCss(colors);
}

function applyToDocument(id: string): void {
  if (id === CUSTOM_THEME_ID) {
    // Custom overlays token overrides on a base preset so the underlying
    // palette resolves correctly even before any token is overridden (a
    // light custom with no overrides reads as light, not the dark @theme
    // default). `data-custom` gates the injected override <style>.
    document.documentElement.dataset.theme =
      customScheme === "light" ? "light" : "default";
    document.documentElement.dataset.custom = "true";
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
let customColors: Record<string, string> = {};

class ThemeStore {
  current = $state(DEFAULT_THEME);
  composer = $state<ComposerStyle>("auto");

  /** Token overrides active in the custom theme (token id → hex). */
  customColors = $state<Record<string, string>>({});
  /** Light/dark scheme for the custom theme (presets carry their own). */
  customScheme = $state<Scheme>("dark");

  composerOptions = COMPOSER_OPTIONS;

  /** Apply the persisted theme to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.current = readStored();
    this.composer = readComposerStyle();
    composerStyle = this.composer;
    const custom = readStoredCustom();
    this.customScheme = custom.scheme;
    customScheme = custom.scheme;
    this.customColors = custom.colors;
    customColors = custom.colors;
    syncCustomStyle(customColors);
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
        this.customColors = c.colors;
        customColors = c.colors;
        syncCustomStyle(customColors);
      }
      applyToDocument(this.current);
    });
  }

  /** Select a preset or the custom theme. */
  set(id: string): void {
    this.current = id;
    applyToDocument(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }

  /** Override one token and activate the custom theme. Editing while on a
   *  preset flips to "custom"; overrides stack on the base palette. */
  setToken(id: string, hex: string): void {
    this.customColors = { ...this.customColors, [id]: hex };
    customColors = this.customColors;
    this.persistCustom();
    syncCustomStyle(customColors);
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

  /** Remove one token override (revert that token to the palette default). */
  resetToken(id: string): void {
    const next = { ...this.customColors };
    delete next[id];
    this.customColors = next;
    customColors = next;
    this.persistCustom();
    syncCustomStyle(customColors);
  }

  /** Remove all token overrides. Stays on the custom theme (now equal to the
   *  base palette) so the user keeps their chosen light/dark scheme. */
  resetAll(): void {
    this.customColors = {};
    customColors = this.customColors;
    this.persistCustom();
    syncCustomStyle(customColors);
  }

  /** Set the light/dark scheme of the custom theme. */
  setCustomScheme(scheme: Scheme): void {
    this.customScheme = scheme;
    customScheme = scheme;
    this.persistCustom();
    if (this.current === CUSTOM_THEME_ID) {
      applyToDocument(CUSTOM_THEME_ID);
    }
  }

  private persistCustom(): void {
    try {
      localStorage.setItem(
        CUSTOM_KEY,
        JSON.stringify({ scheme: this.customScheme, colors: this.customColors }),
      );
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
