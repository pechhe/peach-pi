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
 *  `metalDye` is a separate surface effect: it tints the skeuomorphic metal of
 *  the sidebar rail + composer chassis (not the screen/knobs/LEDs), via the
 *  `--metal-dye` / `--metal-tint-amount` tokens consumed by the device CSS. */
export type PrimaryKey = "bg" | "fg" | "accent";

export interface CustomPrimaries {
  bg?: string;
  fg?: string;
  accent?: string;
  metalDye?: string;
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

/** Metal dye is surfaced as a fourth swatch but is NOT a `PrimaryKey`: it
 *  drives a separate token pair (`--metal-dye` / `--metal-tint-amount`) for
 *  the skeuomorphic chassis, so it has no derived color family. Listed
 *  separately so the UI can render it alongside the primaries. */
export const METAL_DYE_SLOT: { id: "metalDye"; label: string } = {
  id: "metalDye",
  label: "Metal",
};

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
};

/** Mix weight of the metal dye into each neutral chassis stop. Low enough to
 *  preserve the brushed-metal lightness ramp, high enough that the dye reads.
 *  Kept fixed (not a user knob) so a custom theme stays "dyed aluminum", not a
 *  flat color. */
const METAL_TINT_AMOUNT = "40%";

/** Pure: build the `:root[data-custom="true"] { … }` rule from the 3 primaries.
 *  Invalid hex is dropped; an entirely-empty custom theme emits nothing (so the
 *  base preset shows through untouched). Derived families ship only for the
 *  primaries the user actually set, so e.g. an accent-only custom never
 *  disturbs the hand-tuned surfaces of a preset like Dracula. The optional
 *  `metalDye` emits the device-tint tokens. Exported so the derivation can be
 *  unit-tested without a DOM. */
export function buildCustomCss(p: CustomPrimaries): string {
  const lines: string[] = [];
  for (const slot of PRIMARY_SLOTS) {
    const v = p[slot.id];
    if (v && HEX_RE.test(v)) {
      lines.push(`  --color-${slot.id}: ${normHex(v)};`);
      for (const id of slot.family) {
        const formula = DERIVED_FORMULAS[id];
        if (formula) lines.push(`  --color-${id}: ${formula};`);
      }
    }
  }
  if (p.metalDye && HEX_RE.test(p.metalDye)) {
    lines.push(`  --metal-dye: ${normHex(p.metalDye)};`);
    lines.push(`  --metal-tint-amount: ${METAL_TINT_AMOUNT};`);
  }
  return lines.length ? `:root[data-custom="true"] {\n${lines.join("\n")}\n}` : "";
}
