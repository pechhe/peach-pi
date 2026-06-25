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

/** A name is valid when it has non-whitespace content. */
export function isValidThemeName(name: string): boolean {
  return name.trim().length > 0;
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
