/**
 * Pure theme catalog + custom-override helpers, with zero Svelte runes so they
 * can be unit-tested under `node:test` (no DOM / rune transformer required).
 *
 * `theme.svelte.ts` re-exports these for app use; the UI imports from there.
 * The `--color-<id>` ids mirror the `@theme` block in styles/app.css, which
 * is the single source of truth for which tokens exist.
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

/** Theme id representing a user-customized palette (not a preset). Overriding
 *  any token flips the active theme to this id. */
export const CUSTOM_THEME_ID = "custom";

/** Semantic color tokens users can customize, grouped for the editor UI. */
export interface ThemeToken {
  id: string;
  label: string;
  group: string;
}

export const THEME_TOKENS: ThemeToken[] = [
  { id: "bg", label: "Background", group: "Background" },
  { id: "sidebar", label: "Sidebar", group: "Background" },
  { id: "surface", label: "Surface", group: "Background" },
  { id: "surface-2", label: "Surface raised", group: "Background" },
  { id: "surface-3", label: "Surface deepest", group: "Background" },
  { id: "selected", label: "Selected row", group: "Background" },
  { id: "border", label: "Border", group: "Border" },
  { id: "border-strong", label: "Border strong", group: "Border" },
  { id: "border-focus", label: "Border focus", group: "Border" },
  { id: "fg", label: "Text", group: "Text" },
  { id: "fg-soft", label: "Text soft", group: "Text" },
  { id: "muted", label: "Text muted", group: "Text" },
  { id: "faint", label: "Text faint", group: "Text" },
  { id: "fainter", label: "Text faintest", group: "Text" },
  { id: "primary", label: "Primary", group: "Interactive" },
  { id: "primary-fg", label: "Primary text", group: "Interactive" },
  { id: "accent", label: "Accent", group: "Interactive" },
  { id: "danger", label: "Danger", group: "Status" },
  { id: "danger-border", label: "Danger border", group: "Status" },
  { id: "danger-surface", label: "Danger surface", group: "Status" },
  { id: "success", label: "Success", group: "Status" },
  { id: "warning", label: "Warning", group: "Status" },
  { id: "warning-border", label: "Warning border", group: "Status" },
  { id: "warning-surface", label: "Warning surface", group: "Status" },
];

/** Display order for token groups in the editor UI. */
export const THEME_TOKEN_GROUPS = [
  "Background",
  "Border",
  "Text",
  "Interactive",
  "Status",
];

/** Hex color (3–8 hex digits, optional leading #). Used both to validate inputs
 *  and to filter stored overrides, so corrupt/legacy values can't paint. */
export const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/;

/** Pure: build the `:root[data-custom="true"] { … }` rule string from a color
 *  map. Drops anything that isn't a valid token id + hex. Exported so the
 *  override-merge logic can be unit-tested without a DOM. */
export function buildCustomCss(colors: Record<string, string>): string {
  const rules = Object.entries(colors)
    .filter(([id, hex]) => id && typeof hex === "string" && HEX_RE.test(hex))
    .map(([id, hex]) => `  --color-${id}: ${hex.startsWith("#") ? hex : `#${hex}`};`)
    .join("\n");
  // Selector matches whenever custom mode is on, regardless of which base
  // preset backs it. Appended last in <head>, so it wins equal-specificity
  // ties with the preset rules in app.css (both :root[attr] = (0,2,0)).
  return rules ? `:root[data-custom="true"] {\n${rules}\n}` : "";
}
