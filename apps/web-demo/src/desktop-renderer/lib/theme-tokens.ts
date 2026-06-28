/**
 * Pure theme catalog + custom-override helpers, with zero Svelte runes so they
 * can be unit-tested under `node:test` (no DOM / rune transformer required).
 *
 * `theme.svelte.ts` re-exports these for app use; the UI imports from there.
 *
 * Philosophy: a custom theme is NOT a per-token palette (24 knobs is too
 * granular). A user picks up to 3 *primary* colors — Background, Text, Accent —
 * and every shade is *derived* from those via `color-mix`. Status colors
 * (danger / success / warning) are assumed conventional and inherit from the
 * base preset. Derivation is relative (mix toward the other primary), so the
 * same formulas work for dark and light bases alike.
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
  { id: "one-dark", label: "One Dark", scheme: "dark" },
  { id: "monokai", label: "Monokai", scheme: "dark" },
  { id: "gruvbox", label: "Gruvbox", scheme: "dark" },
  { id: "nord", label: "Nord", scheme: "dark" },
  { id: "tokyo-night", label: "Tokyo Night", scheme: "dark" },
  { id: "solarized-light", label: "Solarized Light", scheme: "light" },
  { id: "github-light", label: "GitHub Light", scheme: "light" },
  { id: "catppuccin-latte", label: "Catppuccin Latte", scheme: "light" },
  { id: "one-light", label: "One Light", scheme: "light" },
  { id: "gruvbox-light", label: "Gruvbox Light", scheme: "light" },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", scheme: "light" },
  { id: "everforest-light", label: "Everforest Light", scheme: "light" },
  { id: "kanagawa-lotus", label: "Kanagawa Lotus", scheme: "light" },
  { id: "tomorrow", label: "Tomorrow", scheme: "light" },
  { id: "alabaster", label: "Alabaster", scheme: "light" },
];

/** Theme id representing a user-customized palette (not a preset). Setting any
 *  primary flips the active theme to this id. */
export const CUSTOM_THEME_ID = "custom";

export type Scheme = "dark" | "light";

/** A user-named, persisted theme: a snapshot of a base scheme + up to three
 *  primary colors. Stored as a collection under one localStorage key.
 *  `id` is `saved:<slug>-<rand>`; it can also be the active theme id. */
export interface SavedTheme {
  id: string;
  name: string;
  scheme: Scheme;
  primaries: CustomPrimaries;
  /** Origin marker for display. "imported" flags themes created via the
   *  Import dialog (LLM-read palette); absent means hand-saved. Purely
   *  cosmetic — no behavioral difference. */
  source?: "imported";
}

/** Prefix for saved-theme ids, so they're distinguishable from presets and
 *  from the `custom` working draft. */
export const SAVED_PREFIX = "saved:";

/** Is an id a saved-theme id (vs a preset or `custom`)? */
export function isSavedId(id: string): boolean {
  return id.startsWith(SAVED_PREFIX);
}

/** Build a stable, collision-resistant id for a saved theme from its name. */
export function makeSavedId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
  const rand = Math.random().toString(36).slice(2, 6);
  return `${SAVED_PREFIX}${slug}-${rand}`;
}

// -------------------------------------------------------------------
// Theme mode: how the active theme is chosen.                            //
//   single  → one fixed theme                                            //
//   system  → a light slot + a dark slot; the active one follows the     //
//             OS prefers-color-scheme                                    //
//   rotate  → a light pool + a dark pool; each new calendar day a        //
//             random pick from each pool, OS still decides light/dark    //
// -------------------------------------------------------------------
export type ThemeMode = "single" | "system" | "rotate";

/** User's persisted theme preferences (all modes in one record).           */
export interface ThemePrefs {
  mode: ThemeMode;
  /** `single` mode: the active theme id. */
  single: string;
  /** `system` mode: the light + dark slots. */
  systemLight: string;
  systemDark: string;
  /** `rotate` mode: the pools to roll from each day. */
  rotateLight: string[];
  rotateDark: string[];
  /** Rotate: the day (YYYY-MM-DD) + ids last rolled. Empty day → roll on next init. */
  rotateDate: string;
  rotateActiveLight: string;
  rotateActiveDark: string;
}

/** Theme ids allowed in a light slot/pool (presets + saved themes are
 *  filtered by scheme at use time; this is just the default seed). */
export const DEFAULT_LIGHT_THEME = "light";
export const DEFAULT_DARK_THEME = "default";

export const DEFAULT_PREFS: ThemePrefs = {
  mode: "single",
  single: DEFAULT_DARK_THEME,
  systemLight: DEFAULT_LIGHT_THEME,
  systemDark: DEFAULT_DARK_THEME,
  rotateLight: [],
  rotateDark: [],
  rotateDate: "",
  rotateActiveLight: DEFAULT_LIGHT_THEME,
  rotateActiveDark: DEFAULT_DARK_THEME,
};

/** Sanitize a candidate theme id for slot/pool membership: keep it only if
 *  it resolves to a known preset, saved id, or the custom draft. */
export function isValidThemeId(id: string, savedIds: Set<string>): boolean {
  return id === CUSTOM_THEME_ID || isSavedId(id) && savedIds.has(id) || THEMES.some((t) => t.id === id);
}

/** Does a theme id match a given scheme? Presets/saved/custom resolve via
 *  THEMES (no DOM needed), so this stays pure + unit-testable. */
export function themeScheme(id: string, savedById: Map<string, SavedTheme>): Scheme {
  if (id === CUSTOM_THEME_ID) {
    // The custom draft's scheme is resolved by the store at call time, but for
    // slot validation we only need presets + saved; custom in a slot is rare
    // and falls back to dark.
    return "dark";
  }
  const saved = savedById.get(id);
  if (saved) return saved.scheme;
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

/** Today's date as YYYY-MM-DD (local). Pure + injectable for tests. */
export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Pure rotation roll. Returns the rolled light/dark ids + new date, or the
 *  passed-in prefs unchanged if no reroll is due. Reroll triggers:
 *   - date changed (new day), OR
 *   - an active pick is no longer in its pool (edited/removed), OR
 *   - both pools non-empty but no active pick recorded (first enable).
 *  An empty pool leaves its active slot at the default. Reproducible given
 *  a seeded random via the injected `rand` (defaults to Math.random). */
export function rollRotation(
  prefs: ThemePrefs,
  now: Date = new Date(),
  rand: () => number = Math.random,
): ThemePrefs {
  const today = todayString(now);
  const dayChanged = prefs.rotateDate !== today;
  const lightMissing = prefs.rotateLight.length > 0 && !prefs.rotateLight.includes(prefs.rotateActiveLight);
  const darkMissing = prefs.rotateDark.length > 0 && !prefs.rotateDark.includes(prefs.rotateActiveDark);
  const firstLight = prefs.rotateLight.length > 0 && prefs.rotateDate === "";
  const firstDark = prefs.rotateDark.length > 0 && prefs.rotateDate === "";
  if (!dayChanged && !lightMissing && !darkMissing && !firstLight && !firstDark) {
    return prefs;
  }
  const pick = (pool: string[], current: string): string => {
    if (pool.length === 0) return current;
    if (pool.length === 1) return pool[0] ?? current;
    // Avoid repeating the current pick when possible.
    const others = pool.filter((id) => id !== current);
    if (others.length > 0) return others[Math.floor(rand() * others.length)] ?? current;
    return pool[0] ?? current;
  };
  const rollLight = dayChanged || lightMissing || firstLight;
  const rollDark = dayChanged || darkMissing || firstDark;
  return {
    ...prefs,
    rotateDate: today,
    rotateActiveLight: rollLight ? pick(prefs.rotateLight, prefs.rotateActiveLight) : prefs.rotateActiveLight,
    rotateActiveDark: rollDark ? pick(prefs.rotateDark, prefs.rotateActiveDark) : prefs.rotateActiveDark,
  };
}

/** Resolve the active theme id for a given system scheme under rotate mode.
 *  Empty pool → the matching default, so rotate is never blank. */
export function rotateIdForScheme(prefs: ThemePrefs, scheme: Scheme): string {
  return scheme === "light" ? prefs.rotateActiveLight : prefs.rotateActiveDark;
}


/** A name is valid when it has non-whitespace content. */
export function isValidThemeName(name: string): boolean {
  return name.trim().length > 0;
}

/** All primary keys, including device/screen ones. Mirrors `CustomPrimaries`. */
const ALL_PRIMARY_KEYS = [
  "bg",
  "fg",
  "accent",
  "warning",
  "danger",
  "metalDye",
  "screen",
  "screenText",
  "engraveActive",
] as const;

/** Normalize a loose hex the LLM might return (`1e1e2e`, `#1e1e2e`, `#EEE`,
 *  uppercased, with/without `#`) to a leading-`#` 6-digit hex string. Returns
 *  null when the input doesn't look like a hex color. Used by the import flow
 *  so the model's output is coerced to the same shape the color pickers emit. */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim();
  if (!s || !HEX_RE.test(s)) return null;
  const bare = s.replace(/^#/, "");
  // Expand 3-digit shorthand (#RGB → #RRGGBB).
  const full = bare.length === 3
    ? bare.split("").map((c) => c + c).join("")
    : bare.length === 4
      ? bare // 4/8-digit forms (with alpha) — keep as-is, prefixed.
      : bare;
  return `#${full.toUpperCase()}`;
}

/** Input shape from the theme-import service (loose, model-produced). */
export interface ImportedTheme {
  name?: string;
  scheme?: "dark" | "light";
  primaries?: Partial<Record<(typeof ALL_PRIMARY_KEYS)[number], string>>;
}

/** Coerce and validate an `ImportedTheme` into a `SavedTheme`-compatible
 *  record. Every hex is normalized to leading-`#` 6-digit form; invalid colors
 *  are dropped (the base preset fills them in). Returns null if the result
 *  would be empty (no name AND no primaries). Pure, unit-testable. */
export function normalizeImportedTheme(input: ImportedTheme): {
  name: string;
  scheme: Scheme;
  primaries: CustomPrimaries;
} | null {
  const primaries: CustomPrimaries = {};
  if (input.primaries && typeof input.primaries === "object") {
    for (const key of ALL_PRIMARY_KEYS) {
      const v = input.primaries[key];
      if (typeof v === "string") {
        const hex = normalizeHex(v);
        if (hex) primaries[key] = hex;
      }
    }
  }
  const scheme: Scheme = input.scheme === "light" ? "light" : "dark";
  const name = typeof input.name === "string" && input.name.trim()
    ? input.name.trim()
    : "";
  if (!name && Object.keys(primaries).length === 0) return null;
  return { name, scheme, primaries };
}

/** The colors a custom theme is defined by. Each is optional; an unset
 *  primary falls through to the base preset (and its derived family is skipped,
 *  so e.g. an accent-only custom changes nothing but the accent + focus ring).
 *  `metalDye` tints the skeuomorphic chassis metal; `screen` / `screenText`
 *  recolor the composer's CRT screen background and ink. All three are device
 *  effects driven by token pairs consumed by the device CSS. */
export type PrimaryKey = "bg" | "fg" | "accent";

export interface CustomPrimaries {
  bg?: string;
  fg?: string;
  accent?: string;
  warning?: string;
  danger?: string;
  metalDye?: string;
  screen?: string;
  screenText?: string;
  engraveActive?: string;
}

/** User-facing primary color slots, in display order. `family` lists the token
 *  ids derived from that primary (emitted only when the primary is set). */
export interface PrimarySlot {
  id: PrimaryKey;
  label: string;
  family: string[];
}

export const PRIMARY_SLOTS: PrimarySlot[] = [
  {
    id: "bg",
    label: "Background",
    family: ["sidebar", "surface", "surface-2", "surface-3", "selected", "border", "border-strong"],
  },
  { id: "fg", label: "Text", family: ["fg-soft", "muted", "faint", "fainter", "primary", "primary-fg"] },
  { id: "accent", label: "Accent", family: ["border-focus"] },
];

/** Semantic status colors. Same shape/derivation as primaries (base + a
 *  derived border/surface), but their own slots so the custom theme isn't
 *  stuck with the base preset's red/amber. Border + surface mix toward
 *  `--color-bg`, so they read correctly on light or dark backgrounds. */
export const STATUS_SLOTS: { id: "warning" | "danger"; label: string; family: string[] }[] = [
  { id: "warning", label: "Warning", family: ["warning-border", "warning-surface"] },
  { id: "danger", label: "Error", family: ["danger-border", "danger-surface"] },
];

/** Device color slots surfaced as extra swatches (after the primaries). They
 *  drive token pairs consumed by the device CSS, so — unlike primaries — they
 *  have no derived color family. Each carries the `token` its swatch preview
 *  reads (`var(token)`); the buildCustomCss device block maps these to the
 *  device's own token names (`--cream-*` / etc.). */
export interface DeviceSlot {
  id: "metalDye" | "screen" | "screenText" | "engraveActive";
  label: string;
  token: string;
}

export const DEVICE_SLOTS: DeviceSlot[] = [
  { id: "metalDye", label: "Metal", token: "--metal-dye" },
  { id: "screen", label: "Screen", token: "--color-screen" },
  { id: "screenText", label: "Screen text", token: "--color-screen-text" },
  { id: "engraveActive", label: "Active label", token: "--engrave-active" },
];

/** Hex color (3–8 hex digits, optional leading #). Used to validate inputs and
 *  filter stored overrides, so corrupt/legacy values can't paint. */
export const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/;

/** Normalize an accepted hex to a leading-# form. */
function normHex(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

/**
 * Derived-shade formulas, keyed by token id. Each mixes one primary toward the
 * other (surfaces lift bg→fg; text fades fg→bg; the focus ring follows accent).
 * Percentages are tuned to reproduce the hand-tuned "default" palette within a
 * couple of RGB units, so a custom dark built on the default primaries looks
 * nearly identical to the preset. Values reference `var(--color-*)` so they
 * resolve to either the user override or the base preset, per primary.
 *
 *      color-mix(in srgb, <from>, <to> <p>%)  ⟶  from blended p% toward to
 */
const DERIVED_FORMULAS: Record<string, string> = {
  sidebar: "color-mix(in srgb, var(--color-bg), var(--color-fg) 3%)",
  surface: "color-mix(in srgb, var(--color-bg), var(--color-fg) 4%)",
  "surface-2": "color-mix(in srgb, var(--color-bg), var(--color-fg) 12%)",
  "surface-3": "color-mix(in srgb, var(--color-bg), var(--color-fg) 24%)",
  selected: "color-mix(in srgb, var(--color-bg), var(--color-fg) 14%)",
  border: "color-mix(in srgb, var(--color-bg), var(--color-fg) 11%)",
  "border-strong": "color-mix(in srgb, var(--color-bg), var(--color-fg) 22%)",
  "border-focus": "var(--color-accent)",
  "fg-soft": "color-mix(in srgb, var(--color-fg), var(--color-bg) 9%)",
  muted: "color-mix(in srgb, var(--color-fg), var(--color-bg) 33%)",
  faint: "color-mix(in srgb, var(--color-fg), var(--color-bg) 55%)",
  fainter: "color-mix(in srgb, var(--color-fg), var(--color-bg) 69%)",
  primary: "var(--color-fg)",
  "primary-fg": "var(--color-bg)",
  "warning-border": "color-mix(in srgb, var(--color-warning), var(--color-bg) 58%)",
  "warning-surface": "color-mix(in srgb, var(--color-warning), var(--color-bg) 86%)",
  "danger-border": "color-mix(in srgb, var(--color-danger), var(--color-bg) 58%)",
  "danger-surface": "color-mix(in srgb, var(--color-danger), var(--color-bg) 86%)",
};

/** Mix weight of the metal dye into each neutral chassis stop. Low enough to
 *  preserve the brushed-metal lightness ramp, high enough that the dye reads.
 *  Kept fixed (not a user knob) so a custom theme stays "dyed aluminum", not a
 *  flat color. */
const METAL_TINT_AMOUNT = "40%";

/** Pure: build the custom-theme CSS from the primaries + device colors.
 *  Emits up to two rules:
 *   1. `:root[data-custom="true"]` — color primaries, derived families, the
 *      metal-dye tokens, and the `--color-screen` / `--color-screen-text`
 *      preview tokens (on :root so the settings swatches can preview them).
 *   2. `:root[data-custom="true"] .composer-device` — maps the device's own
 *      token names (`--cream-*`) onto the preview tokens, with derived
 *      highlight/shadow/muted stops. Scoped to `.composer-device` because the
 *      device defines those tokens there (not on :root); higher specificity
 *      than the base `.composer-device` block so it wins.
 *  Invalid hex is dropped; an entirely-empty theme emits nothing. Exported so
 *  the derivation is unit-tested without a DOM. */
export function buildCustomCss(p: CustomPrimaries): string {
  const rootLines: string[] = [];
  const deviceLines: string[] = [];

  for (const slot of [...PRIMARY_SLOTS, ...STATUS_SLOTS] as {
    id: keyof CustomPrimaries;
    label: string;
    family: string[];
  }[]) {
    const v = p[slot.id];
    if (v && HEX_RE.test(v)) {
      rootLines.push(`  --color-${slot.id}: ${normHex(v)};`);
      for (const id of slot.family) {
        const formula = DERIVED_FORMULAS[id];
        if (formula) rootLines.push(`  --color-${id}: ${formula};`);
      }
    }
  }
  if (p.metalDye && HEX_RE.test(p.metalDye)) {
    rootLines.push(`  --metal-dye: ${normHex(p.metalDye)};`);
    rootLines.push(`  --metal-tint-amount: ${METAL_TINT_AMOUNT};`);
  }
  // Composer CRT screen background. The device reads `--cream-bg*`; we set a
  // preview token on :root and remap the cream tokens to it on the device.
  if (p.screen && HEX_RE.test(p.screen)) {
    rootLines.push(`  --color-screen: ${normHex(p.screen)};`);
    deviceLines.push("  --cream-bg: var(--color-screen);");
    deviceLines.push("  --cream-bg-hi: color-mix(in oklch, var(--color-screen), white 8%);");
    deviceLines.push("  --cream-bg-lo: color-mix(in oklch, var(--color-screen), black 8%);");
  }
  // Composer CRT ink (typed text). `--cream-ink-muted` is the ink lightened
  //  toward white (matches the base palette's "same hue, higher L" muted),
  //  NOT mixed toward the screen bg: an achromatic endpoint can't detour
  //  through a foreign hue (the OKLCH short-path bug that turns red→purple).
  if (p.screenText && HEX_RE.test(p.screenText)) {
    rootLines.push(`  --color-screen-text: ${normHex(p.screenText)};`);
    deviceLines.push("  --cream-ink: var(--color-screen-text);");
    deviceLines.push("  --cream-ink-muted: color-mix(in oklch, var(--color-screen-text), white 30%);");
  }
  // Sidebar active engraved label ink. A single lit colour (same in light
  //  and dark) so the active nav item reads as "lit" against the machined
  //  metal. Consumed by .main-nav-item--active in sidebar-device.css.
  if (p.engraveActive && HEX_RE.test(p.engraveActive)) {
    rootLines.push(`  --engrave-active: ${normHex(p.engraveActive)};`);
  }

  const blocks: string[] = [];
  if (rootLines.length) blocks.push(`:root[data-custom="true"] {\n${rootLines.join("\n")}\n}`);
  if (deviceLines.length) blocks.push(`:root[data-custom="true"] .composer-device {\n${deviceLines.join("\n")}\n}`);
  return blocks.join("\n");
}
