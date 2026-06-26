import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFS,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  isValidThemeId,
  rollRotation,
  rotateIdForScheme,
  themeScheme,
  todayString,
  type ThemePrefs,
  type SavedTheme,
} from "../../src/lib/theme-tokens.ts";

const base: ThemePrefs = { ...DEFAULT_PREFS };

test("isValidThemeId: presets accepted, junk rejected, saved gated by set", () => {
  assert.ok(isValidThemeId("default", new Set()));
  assert.ok(isValidThemeId("nord", new Set()));
  assert.ok(isValidThemeId("custom", new Set()));
  assert.ok(isValidThemeId("saved:x-ab12", new Set(["saved:x-ab12"])));
  assert.ok(!isValidThemeId("saved:x-ab12", new Set())); // unknown saved id
  assert.ok(!isValidThemeId("nonexistent", new Set()));
  assert.ok(!isValidThemeId("", new Set()));
});

test("themeScheme: presets resolve their declared scheme", () => {
  const empty = new Map();
  assert.equal(themeScheme("default", empty), "dark");
  assert.equal(themeScheme("light", empty), "light");
  assert.equal(themeScheme("solarized-light", empty), "light");
  assert.equal(themeScheme("tokyo-night", empty), "dark");
  assert.equal(themeScheme("nonexistent", empty), "dark");
  assert.equal(themeScheme("custom", empty), "dark"); // custom falls back to dark
  const saved = new Map<string, SavedTheme>([["saved:warm-cd12", { id: "saved:warm-cd12", name: "Warm", scheme: "light", primaries: {} }]]);
  assert.equal(themeScheme("saved:warm-cd12", saved), "light");
});

test("todayString: zero-padded YYYY-MM-DD, local time", () => {
  assert.equal(todayString(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(todayString(new Date(2026, 10, 25)), "2026-11-25");
  assert.equal(todayString(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("rollRotation: same day, valid picks → no change", () => {
  const now = new Date(2026, 5, 25);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: ["light", "solarized-light"],
    rotateDark: ["default", "nord"],
    rotateDate: "2026-06-25",
    rotateActiveLight: "light",
    rotateActiveDark: "default",
  };
  assert.equal(rollRotation(prefs, now, Math.random), prefs);
});

test("rollRotation: new day rerolls both pools, never repeats current when avoidable", () => {
  const now = new Date(2026, 5, 26);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: ["light", "solarized-light"],
    rotateDark: ["default", "nord"],
    rotateDate: "2026-06-25",
    rotateActiveLight: "light",
    rotateActiveDark: "default",
  };
  // Seeded rand → deterministic. Others are [solarized-light] and [nord].
  const out = rollRotation(prefs, now, () => 0.99);
  assert.equal(out.rotateDate, "2026-06-26");
  assert.equal(out.rotateActiveLight, "solarized-light");
  assert.equal(out.rotateActiveDark, "nord");
});

test("rollRotation: active pick removed from pool → reroll that scheme only", () => {
  const now = new Date(2026, 5, 25);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: ["light", "solarized-light"],
    rotateDark: ["default", "nord", "monokai"],
    rotateDate: "2026-06-25",
    rotateActiveLight: "solarized-light", // still valid
    rotateActiveDark: "tokyo-night",      // NOT in pool → dark rerolls, light stays
  };
  const out = rollRotation(prefs, now, () => 0);
  assert.equal(out.rotateActiveLight, "solarized-light"); // unchanged
  assert.notEqual(out.rotateActiveDark, "tokyo-night");
  assert.ok(["default", "nord", "monokai"].includes(out.rotateActiveDark));
});

test("rollRotation: first enable (empty date) rolls when pools populated", () => {
  const now = new Date(2026, 5, 25);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: ["light"],
    rotateDark: ["default", "nord"],
    rotateDate: "",
    rotateActiveLight: DEFAULT_LIGHT_THEME,
    rotateActiveDark: DEFAULT_DARK_THEME,
  };
  const out = rollRotation(prefs, now, () => 0.5);
  assert.equal(out.rotateDate, "2026-06-25");
  assert.equal(out.rotateActiveLight, "light"); // single-element pool
  assert.ok(["default", "nord"].includes(out.rotateActiveDark));
});

test("rollRotation: empty pool leaves its active slot at default", () => {
  const now = new Date(2026, 5, 26);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: [], // no light pool → stays default
    rotateDark: ["default", "nord"],
    rotateDate: "2026-06-25",
    rotateActiveLight: DEFAULT_LIGHT_THEME,
    rotateActiveDark: "default",
  };
  const out = rollRotation(prefs, now, () => 0);
  assert.equal(out.rotateActiveLight, DEFAULT_LIGHT_THEME);
  assert.equal(out.rotateActiveDark, "nord");
});

test("rollRotation: single-element pool keeps that element (no reroll noise)", () => {
  const now = new Date(2026, 5, 26);
  const prefs: ThemePrefs = {
    ...base,
    mode: "rotate",
    rotateLight: ["rose-pine-dawn"],
    rotateDark: ["tokyo-night"],
    rotateDate: "2026-06-25",
    rotateActiveLight: DEFAULT_LIGHT_THEME,
    rotateActiveDark: DEFAULT_DARK_THEME,
  };
  const out = rollRotation(prefs, now, () => 0.5);
  assert.equal(out.rotateActiveLight, "rose-pine-dawn");
  assert.equal(out.rotateActiveDark, "tokyo-night");
});

test("rotateIdForScheme: returns the active pick per scheme", () => {
  const prefs: ThemePrefs = {
    ...base,
    rotateActiveLight: "solarized-light",
    rotateActiveDark: "gruvbox",
  };
  assert.equal(rotateIdForScheme(prefs, "light"), "solarized-light");
  assert.equal(rotateIdForScheme(prefs, "dark"), "gruvbox");
});

test("DEFAULT_PREFS: single mode, dark single, no rotation pools", () => {
  assert.equal(DEFAULT_PREFS.mode, "single");
  assert.equal(DEFAULT_PREFS.single, DEFAULT_DARK_THEME);
  assert.equal(DEFAULT_PREFS.systemLight, DEFAULT_LIGHT_THEME);
  assert.equal(DEFAULT_PREFS.systemDark, DEFAULT_DARK_THEME);
  assert.deepEqual(DEFAULT_PREFS.rotateLight, []);
  assert.deepEqual(DEFAULT_PREFS.rotateDark, []);
  assert.equal(DEFAULT_PREFS.rotateDate, "");
});
