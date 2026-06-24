import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomCss,
  CUSTOM_THEME_ID,
  HEX_RE,
  isSavedId,
  isValidThemeName,
  makeSavedId,
  PRIMARY_SLOTS,
  SAVED_PREFIX,
  THEMES,
} from "../../src/lib/theme-tokens.ts";

test("buildCustomCss: empty primaries emit nothing", () => {
  assert.equal(buildCustomCss({}), "");
  assert.equal(buildCustomCss({ bg: "", fg: undefined }), "");
});

test("buildCustomCss: each primary emits itself + its derived family", () => {
  // bg set → surface/border family derived via color-mix
  const bg = buildCustomCss({ bg: "#101012" });
  assert.match(bg, /:root\[data-custom="true"\]/);
  assert.match(bg, /--color-bg: #101012;/);
  assert.match(bg, /--color-surface: color-mix\(in srgb, var\(--color-bg\), var\(--color-fg\) 4%\);/);
  assert.match(bg, /--color-border: color-mix\(in srgb, var\(--color-bg\), var\(--color-fg\) 11%\);/);

  // fg set → text-shade family derived toward bg
  const fg = buildCustomCss({ fg: "#e7e7ea" });
  assert.match(fg, /--color-fg: #e7e7ea;/);
  assert.match(fg, /--color-muted: color-mix\(in srgb, var\(--color-fg\), var\(--color-bg\) 33%\);/);
  assert.match(fg, /--color-primary: var\(--color-fg\);/);
  assert.match(fg, /--color-primary-fg: var\(--color-bg\);/);

  // accent set → border-focus mirrors accent
  const accent = buildCustomCss({ accent: "#38bdf8" });
  assert.match(accent, /--color-accent: #38bdf8;/);
  assert.match(accent, /--color-border-focus: var\(--color-accent\);/);
});

test("buildCustomCss: only the families of SET primaries ship (accent-only doesn't touch surfaces)", () => {
  const css = buildCustomCss({ accent: "#38bdf8" });
  assert.doesNotMatch(css, /--color-surface/); // bg family stays with base preset
  assert.doesNotMatch(css, /--color-muted/); // fg family stays with base preset
  assert.match(css, /--color-border-focus/); // accent family ships
});

test("buildCustomCss: warning/danger each emit base + derived border/surface", () => {
  const warn = buildCustomCss({ warning: "#fbbf24" });
  assert.match(warn, /--color-warning: #fbbf24;/);
  assert.match(warn, /--color-warning-border: color-mix\(in srgb, var\(--color-warning\), var\(--color-bg\) 58%\);/);
  assert.match(warn, /--color-warning-surface: color-mix\(in srgb, var\(--color-warning\), var\(--color-bg\) 86%\);/);
  // danger untouched when only warning is set
  assert.doesNotMatch(warn, /--color-danger/);

  const err = buildCustomCss({ danger: "#ff5555" });
  assert.match(err, /--color-danger: #ff5555;/);
  assert.match(err, /--color-danger-border: color-mix\(in srgb, var\(--color-danger\), var\(--color-bg\) 58%\);/);
  assert.match(err, /--color-danger-surface: color-mix\(in srgb, var\(--color-danger\), var\(--color-bg\) 86%\);/);
  assert.doesNotMatch(err, /--color-warning/);
});

test("buildCustomCss: invalid warning/danger are dropped (base + family skipped)", () => {
  const css = buildCustomCss({ warning: "nope", accent: "#38bdf8" });
  assert.doesNotMatch(css, /--color-warning/);
  assert.match(css, /--color-accent/);
});

test("buildCustomCss: metalDye emits the chassis tint tokens, independent of the color primaries", () => {
  const css = buildCustomCss({ metalDye: "#7c3aed" });
  assert.match(css, /--metal-dye: #7c3aed;/);
  assert.match(css, /--metal-tint-amount: \d+%;/);
  // No color primaries set → no --color-* overrides, only the metal tokens.
  assert.doesNotMatch(css, /--color-bg:/);
  assert.doesNotMatch(css, /--color-accent:/);
});

test("buildCustomCss: metalDye + primaries compose in one rule", () => {
  const css = buildCustomCss({ bg: "#101012", metalDye: "#0ea5e9" });
  assert.match(css, /--color-bg:/);
  assert.match(css, /--metal-dye:/);
});

test("buildCustomCss: invalid metalDye is dropped", () => {
  const css = buildCustomCss({ metalDye: "not-a-color", accent: "#38bdf8" });
  assert.doesNotMatch(css, /--metal-dye/);
  assert.match(css, /--color-accent/);
});

test("buildCustomCss: screen emits a preview token on :root + a device block mapping cream tokens", () => {
  const css = buildCustomCss({ screen: "#1a1a2e" });
  // preview token on :root (so settings swatch resolves)
  assert.match(css, /--color-screen: #1a1a2e;/);
  // device-scoped block remaps the cream background tokens
  assert.match(css, /:root\[data-custom="true"\] \.composer-device \{/);
  assert.match(css, /--cream-bg: var\(--color-screen\);/);
  assert.match(css, /--cream-bg-hi: color-mix\(in oklch, var\(--color-screen\), white 8%\);/);
  assert.match(css, /--cream-bg-lo: color-mix\(in oklch, var\(--color-screen\), black 8%\);/);
});

test("buildCustomCss: screenText emits a preview token + cream-ink device tokens", () => {
  const css = buildCustomCss({ screenText: "#e8e8f0" });
  assert.match(css, /--color-screen-text: #e8e8f0;/);
  assert.match(css, /--cream-ink: var\(--color-screen-text\);/);
  // muted fades toward the screen bg (var(--cream-bg) resolves at use site)
  assert.match(css, /--cream-ink-muted: color-mix\(in oklch, var\(--color-screen-text\), white 30%\);/);
});

test("buildCustomCss: engraveActive emits the --engrave-active token on :root (no device block)", () => {
  const css = buildCustomCss({ engraveActive: "#e8932b" });
  assert.match(css, /--engrave-active: #e8932b;/);
  // it's a :root token, not a .composer-device mapping
  assert.ok(!css.includes(".composer-device"), "engraveActive must not emit a device block");
});

test("buildCustomCss: invalid engraveActive is dropped", () => {
  const css = buildCustomCss({ engraveActive: "nope", accent: "#38bdf8" });
  assert.ok(!css.includes("--engrave-active"), "invalid engraveActive should be dropped");
});

test("buildCustomCss: device block only emitted when a device color is set", () => {
  // primaries-only → no .composer-device block at all
  const noDevice = buildCustomCss({ bg: "#101012", accent: "#38bdf8" });
  assert.doesNotMatch(noDevice, /\.composer-device/);
  // a device color adds the block while keeping the :root block
  const withDevice = buildCustomCss({ bg: "#101012", screen: "#20202c" });
  assert.match(withDevice, /:root\[data-custom="true"\] \{/);
  assert.match(withDevice, /:root\[data-custom="true"\] \.composer-device \{/);
});

test("buildCustomCss: invalid screen/screenText are dropped", () => {
  const css = buildCustomCss({ screen: "nope", screenText: "also-no", accent: "#38bdf8" });
  assert.doesNotMatch(css, /--color-screen/);
  assert.doesNotMatch(css, /cream-bg/);
  assert.doesNotMatch(css, /cream-ink/);
  assert.doesNotMatch(css, /\.composer-device/);
  assert.match(css, /--color-accent/);
});

test("buildCustomCss: ink-muted mixes toward WHITE (achromatic), never the screen bg", () => {
  // Regression guard for the OKLCH hue short-path bug: mixing a red ink toward
  // a blue/cream screen bg detours through purple. The muted stop must lighten
  // toward white instead, so the hue can't flip.
  const css = buildCustomCss({ screenText: "#c0392b" });
  assert.match(css, /--cream-ink-muted: color-mix\(in oklch, var\(--color-screen-text\), white 30%\);/);
  assert.doesNotMatch(css, /cream-ink-muted.*var\(--cream-bg\)/);
});

test("buildCustomCss: invalid hex is dropped (primary + its family)", () => {
  const css = buildCustomCss({ bg: "not-a-color", accent: "#38bdf8" });
  assert.doesNotMatch(css, /--color-bg:/);
  assert.doesNotMatch(css, /--color-surface/); // family skipped too
  assert.match(css, /--color-accent: #38bdf8;/);
});

test("buildCustomCss: hex without leading # is normalized", () => {
  assert.match(buildCustomCss({ accent: "38bdf8" }), /--color-accent: #38bdf8;/);
});

test("HEX_RE: accepts 3–8 hex with optional #, rejects non-hex / empty", () => {
  for (const ok of ["#fff", "fff", "#abcd", "abcdef", "#11223344", "abcDEF", "12345"]) {
    assert.ok(HEX_RE.test(ok), `expected ok: ${ok}`);
  }
  for (const bad of ["", "zzz", "#ggg", "##fff", "#12", "#1122334455"]) {
    assert.ok(!HEX_RE.test(bad), `expected reject: ${bad}`);
  }
});

test("PRIMARY_SLOTS: exactly 3 primaries (bg / fg / accent), all labelled, families non-empty", () => {
  assert.equal(PRIMARY_SLOTS.length, 3);
  const ids = PRIMARY_SLOTS.map((s) => s.id);
  assert.deepEqual(ids, ["bg", "fg", "accent"]);
  for (const s of PRIMARY_SLOTS) {
    assert.ok(s.label.length > 0);
    assert.ok(s.family.length > 0, `${s.id} family empty`);
  }
});

test("THEMES + CUSTOM_THEME_ID are consistent", () => {
  assert.ok(!THEMES.some((t) => t.id === CUSTOM_THEME_ID));
  for (const t of THEMES) {
    assert.ok(t.scheme === "dark" || t.scheme === "light");
  }
});

test("isSavedId: true only for the saved: prefix", () => {
  assert.ok(isSavedId("saved:midnight-ab12"));
  assert.ok(isSavedId(SAVED_PREFIX + "x"));
  assert.ok(!isSavedId("custom"));
  assert.ok(!isSavedId("default"));
  assert.ok(!isSavedId("dracula"));
  assert.ok(!isSavedId(""));
});

test("isValidThemeName: requires non-whitespace", () => {
  assert.ok(isValidThemeName("Midnight"));
  assert.ok(isValidThemeName("  Ocean Blue  "));
  assert.ok(!isValidThemeName(""));
  assert.ok(!isValidThemeName("   "));
  assert.ok(!isValidThemeName("\t\n"));
});

test("makeSavedId: saved: prefix + slug + random, no collision-free structure", () => {
  const id = makeSavedId("Midnight Blue!");
  assert.ok(isSavedId(id), `${id} should be a saved id`);
  assert.ok(id.startsWith(SAVED_PREFIX));
  // slug is lowercased, non-alphanumerics collapsed to dashes.
  assert.match(id, /saved:midnight-blue-[a-z0-9]{4}$/);
});

test("makeSavedId: empty/whitespace name falls back to a generic slug", () => {
  const id = makeSavedId("   !!!   ");
  assert.ok(id.startsWith(SAVED_PREFIX));
  assert.match(id, /saved:theme-[a-z0-9]{4}$/);
});

test("makeSavedId: generates distinct ids across calls (random suffix)", () => {
  const ids = new Set(Array.from({ length: 30 }, () => makeSavedId("same")));
  // Not guaranteed unique, but 30 draws are extremely unlikely to all collide.
  assert.ok(ids.size > 1, `expected variation, got ${ids.size}`);
});
