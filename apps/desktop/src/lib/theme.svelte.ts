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
  normalizeHex,
  normalizeImportedTheme,
  DEFAULT_PREFS,
  DEFAULT_LIGHT_THEME,
  DEFAULT_DARK_THEME,
  isValidThemeId,
  themeScheme,
  todayString,
  rollRotation,
  rotateIdForScheme,
  type ThemeOption,
  type CustomPrimaries,
  type PrimaryKey,
  type SavedTheme,
  type Scheme,
  type ThemeMode,
  type ThemePrefs,
  type ImportedTheme,
} from "./theme-tokens";
import {
  CUSTOM_THEME_ID,
  THEMES,
  buildCustomCss,
  isSavedId,
  makeSavedId,
  isValidThemeName,
  isValidThemeId,
  normalizeImportedTheme,
  themeScheme,
  rollRotation,
  rotateIdForScheme,
  DEFAULT_PREFS,
  DEFAULT_LIGHT_THEME,
  DEFAULT_DARK_THEME,
  type CustomPrimaries,
  type PrimaryKey,
  type SavedTheme,
  type Scheme,
  type ThemeMode,
  type ThemePrefs,
  type ImportedTheme,
} from "./theme-tokens";

const KEY = "peachpi:theme";
const DEFAULT_THEME = "default";

/** Serialized custom theme: `{ scheme, primaries }` where primaries holds up
 *  to three hex overrides (bg / fg / accent). */
const CUSTOM_KEY = "peachpi:custom-theme";
/** User-named saved themes: `SavedTheme[]`. */
const SAVED_KEY = "peachpi:saved-themes";
const CUSTOM_STYLE_ID = "peachpi-custom-theme";

/** Theme mode preferences (single / system / rotate). One JSON record. */
const PREFS_KEY = "peachpi:theme-prefs";

/** Match-media query for the OS color scheme (null when unavailable). */
let darkQuery: MediaQueryList | null = null;

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

/** Index saved themes by id for O(1) scheme lookups in pure helpers. */
function savedById(list: SavedTheme[]): Map<string, SavedTheme> {
  return new Map(list.map((t) => [t.id, t]));
}

/** True when `prefers-color-scheme: dark` (or unknown → dark default). */
function systemPrefersDark(): boolean {
  if (darkQuery) return darkQuery.matches;
  try {
    darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    return darkQuery.matches;
  } catch {
    return true;
  }
}

/** Sanitize a single slot id (system light/dark): keep only if it's a known
 *  theme of the requested scheme. Falls back to the scheme default. */
function sanitizeSlot(
  id: unknown,
  scheme: Scheme,
  saved: SavedTheme[],
): string {
  if (typeof id !== "string" || !id) return scheme === "light" ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
  const savedIds = new Set(saved.map((t) => t.id));
  if (!isValidThemeId(id, savedIds)) return scheme === "light" ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
  const byId = savedById(saved);
  if (themeScheme(id, byId) !== scheme) return scheme === "light" ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
  return id;
}

/** Sanitize a rotate pool: keep only ids that are known + match the scheme. */
function sanitizePool(
  raw: unknown,
  scheme: Scheme,
  saved: SavedTheme[],
): string[] {
  if (!Array.isArray(raw)) return [];
  const byId = savedById(saved);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (
      typeof id === "string" &&
      !seen.has(id) &&
      isValidThemeId(id, new Set(saved.map((t) => t.id))) &&
      themeScheme(id, byId) === scheme
    ) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Read + sanitize theme prefs. Migrates the legacy single-theme key when no
 *  prefs record exists yet (first load after the mode feature shipped). */
function readPrefs(saved: SavedTheme[]): ThemePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      // Migrate: promote the legacy `peachpi:theme` id to single mode.
      const legacy = readStored();
      return { ...DEFAULT_PREFS, mode: "single", single: legacy };
    }
    const p = JSON.parse(raw) as Partial<ThemePrefs>;
    const mode: ThemeMode =
      p.mode === "system" || p.mode === "rotate" ? p.mode : "single";
    const single =
      typeof p.single === "string" && isValidThemeId(p.single, new Set(saved.map((t) => t.id)))
        ? p.single
        : DEFAULT_DARK_THEME;
    return {
      mode,
      single,
      systemLight: sanitizeSlot(p.systemLight, "light", saved),
      systemDark: sanitizeSlot(p.systemDark, "dark", saved),
      rotateLight: sanitizePool(p.rotateLight, "light", saved),
      rotateDark: sanitizePool(p.rotateDark, "dark", saved),
      rotateDate: typeof p.rotateDate === "string" ? p.rotateDate : "",
      rotateActiveLight: sanitizeSlot(p.rotateActiveLight, "light", saved),
      rotateActiveDark: sanitizeSlot(p.rotateActiveDark, "dark", saved),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Resolve the active theme id for a prefs record under the current OS scheme. */
function resolveActiveId(prefs: ThemePrefs, scheme: Scheme): string {
  switch (prefs.mode) {
    case "single":
      return prefs.single;
    case "system":
      return scheme === "light" ? prefs.systemLight : prefs.systemDark;
    case "rotate":
      return rotateIdForScheme(prefs, scheme);
  }
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
        ...(t.source === "imported" ? { source: "imported" as const } : {}),
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
/** Mirror of `prefs` for use in the plain resolver functions above. */
let prefs: ThemePrefs = { ...DEFAULT_PREFS };

class ThemeStore {
  /** Resolved active theme id (presets, saved, or custom). Reactive so the
   *  selector can highlight it; also driven by system/rotate resolution. */
  current = $state(DEFAULT_THEME);
  composer = $state<ComposerStyle>("auto");

  /** Theme mode + slots/pools. Drives `current` via resolveActiveId. */
  prefs = $state<ThemePrefs>({ ...DEFAULT_PREFS });

  /** The 3 primary colors defining the custom working draft (each optional). */
  customPrimaries = $state<CustomPrimaries>({});
  /** Light/dark scheme for the custom draft (presets carry their own). */
  customScheme = $state<Scheme>("dark");
  /** User-named, persisted themes. */
  savedThemes = $state<SavedTheme[]>([]);

  composerOptions = COMPOSER_OPTIONS;

  /** Resolve + apply the active theme for the current prefs/OS scheme. The
   *  single source of truth for `current` + the DOM under any mode. */
  private reapply(): void {
    const scheme = systemPrefersDark() ? "dark" : "light";
    const id = resolveActiveId(prefs, scheme);
    this.current = id;
    applyToDocument(id);
  }

  /** Persist prefs to localStorage (and keep the module mirror in sync). */
  private persistPrefs(): void {
    prefs = this.prefs;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
  }

  /** Apply the persisted theme to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.composer = readComposerStyle();
    composerStyle = this.composer;
    const custom = readStoredCustom();
    this.customScheme = custom.scheme;
    customScheme = custom.scheme;
    this.customPrimaries = custom.primaries;
    customPrimaries = this.customPrimaries;
    this.savedThemes = readStoredSaved();
    savedThemes = this.savedThemes;
    // Prefs depend on saved themes (slot sanitization), so read after them.
    const loaded = readPrefs(this.savedThemes);
    // Rotate: roll for a new day (or if a pool changed under the active pick).
    const rolled = loaded.mode === "rotate" ? rollRotation(loaded) : loaded;
    this.prefs = rolled;
    prefs = rolled;
    if (rolled !== loaded) {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(rolled));
      } catch {
        /* ignore */
      }
    }
    this.reapply();
    // OS scheme changes drive system + rotate modes.
    try {
      if (!darkQuery) darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
      darkQuery.addEventListener("change", () => this.reapply());
    } catch {
      /* matchMedia unsupported — system/rotate stay on the dark default */
    }
    // Cross-window sync: `storage` fires only in *other* documents of the
    // same origin, so a change in one window updates the rest.
    window.addEventListener("storage", (e) => {
      if (e.key === PREFS_KEY && e.newValue) {
        const next = readPrefs(this.savedThemes);
        this.prefs = next;
        prefs = next;
        this.reapply();
      }
      if (e.key === KEY && e.newValue) {
        // Legacy single-theme key: migrate into single mode.
        this.prefs = { ...this.prefs, mode: "single", single: e.newValue };
        prefs = this.prefs;
        this.reapply();
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
      this.reapply();
    });
  }

  /** Set the theme mode (single / system / rotate). Rolls rotation on enter. */
  setMode(mode: ThemeMode): void {
    if (mode === this.prefs.mode) return;
    let next = { ...this.prefs, mode };
    if (mode === "rotate") next = rollRotation(next);
    this.prefs = next;
    this.persistPrefs();
    this.reapply();
  }

  /** `single` mode: pick the active theme. */
  setSingle(id: string): void {
    this.prefs = { ...this.prefs, mode: "single", single: id };
    this.persistPrefs();
    this.reapply();
  }

  /** `system` mode: set the light or dark slot. */
  setSystemSlot(scheme: Scheme, id: string): void {
    this.prefs =
      scheme === "light"
        ? { ...this.prefs, mode: "system", systemLight: id }
        : { ...this.prefs, mode: "system", systemDark: id };
    this.persistPrefs();
    this.reapply();
  }

  /** `rotate` mode: toggle a theme id in/out of a scheme's pool. */
  toggleRotatePool(scheme: Scheme, id: string): void {
    const pool = scheme === "light" ? this.prefs.rotateLight : this.prefs.rotateDark;
    const nextPool = pool.includes(id) ? pool.filter((x) => x !== id) : [...pool, id];
    const base: ThemePrefs =
      scheme === "light"
        ? { ...this.prefs, rotateLight: nextPool }
        : { ...this.prefs, rotateDark: nextPool };
    // Pool change may invalidate the active pick → reroll this scheme only.
    const next = rollRotation({ ...base, mode: "rotate" });
    this.prefs = next;
    this.persistPrefs();
    this.reapply();
  }

  /** Force a reroll now (rotates both pools, ignoring the day gate). */
  rerotate(): void {
    const next = rollRotation({ ...this.prefs, rotateDate: "" });
    this.prefs = next;
    this.persistPrefs();
    this.reapply();
  }

  /** Select a preset, a saved theme, or the custom draft (single mode).
   *  Kept for the existing custom-editor flow + external callers. */
  set(id: string): void {
    this.setSingle(id);
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
      // Editing the draft flips to custom draft as the single-mode theme.
      this.prefs = { ...this.prefs, mode: "single", single: CUSTOM_THEME_ID };
      this.persistPrefs();
      this.current = CUSTOM_THEME_ID;
      applyToDocument(CUSTOM_THEME_ID);
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
    this.prefs = { ...this.prefs, mode: "single", single: id };
    this.persistPrefs();
    this.current = id;
    applyToDocument(id);
    return id;
  }

  /** Promote an LLM-produced imported theme into a saved theme and activate
   *  it. `input` is the loose model output; this normalizes every hex (dropping
   *  invalid ones) and derives a name when the model omitted one. Returns the
   *  new saved id, or empty string when the import had nothing usable. */
  addImportedTheme(input: ImportedTheme): string {
    const norm = normalizeImportedTheme(input);
    if (!norm) return "";
    const baseName = norm.name || "Imported theme";
    // Disambiguate against an existing saved theme with the same name by
    // appending a counter — makeSavedId already adds a random suffix, but
    // matching display names read better with a trailing number.
    let name = baseName;
    const existingNames = new Set(this.savedThemes.map((t) => t.name));
    if (existingNames.has(name)) {
      let i = 2;
      while (existingNames.has(`${baseName} ${i}`)) i++;
      name = `${baseName} ${i}`;
    }
    const id = makeSavedId(name);
    const t: SavedTheme = {
      id,
      name,
      scheme: norm.scheme,
      primaries: norm.primaries,
      source: "imported",
    };
    const next = [...this.savedThemes, t];
    this.savedThemes = next;
    savedThemes = next;
    this.persistSaved();
    this.prefs = { ...this.prefs, mode: "single", single: id };
    this.persistPrefs();
    this.current = id;
    applyToDocument(id);
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
