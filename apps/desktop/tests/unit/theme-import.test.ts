import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEX_RE,
  normalizeHex,
  normalizeImportedTheme,
  type ImportedTheme,
} from "../../src/lib/theme-tokens.ts";

// normalizeHex: the security boundary for LLM-produced colors. Anything that
// isn't recognizably hex must be rejected (null); valid forms are coerced to
// the same leading-# 6-digit uppercase shape the color pickers emit.
test("normalizeHex: rejects non-hex input", () => {
  assert.equal(normalizeHex(""), null);
  assert.equal(normalizeHex("   "), null);
  assert.equal(normalizeHex("not-a-color"), null);
  assert.equal(normalizeHex("rgb(1,2,3)"), null);
  assert.equal(normalizeHex("#gggggg"), null); // non-hex chars
  // Note: a bare 5-digit run like "12345" matches HEX_RE's {3,8} range, so
  // normalizeHex keeps it (prefixed + uppercased). The color picker only ever
  // emits 6-digit hex; we don't over-constrain here to stay consistent with
  // the existing HEX_RE the rest of the theme system uses.
});

test("normalizeHex: leading # optional, uppercased", () => {
  assert.equal(normalizeHex("#1e1e2e"), "#1E1E2E");
  assert.equal(normalizeHex("1e1e2e"), "#1E1E2E");
  assert.equal(normalizeHex("#ABCDEF"), "#ABCDEF");
  assert.equal(normalizeHex("abcdef"), "#ABCDEF");
});

test("normalizeHex: 3-digit shorthand expands to 6", () => {
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex("abc"), "#AABBCC");
  assert.equal(normalizeHex("#F0A"), "#FF00AA");
});

test("normalizeHex: passes HEX_RE equivalence for valid 6-digit", () => {
  // Cross-check the regex the rest of the theme system uses agrees that a
  // normalized result is still valid input.
  assert.equal(HEX_RE.test(normalizeHex("#1e1e2e")!.replace(/^#/, "")), true);
});

// normalizeImportedTheme: turns loose model output into a SavedTheme record.
// Invalid colors are dropped silently (the base preset fills them in); the
// whole thing is null only when there's literally nothing usable.
test("normalizeImportedTheme: normalizes every primary, drops invalid", () => {
  const input: ImportedTheme = {
    name: "Dracula",
    scheme: "dark",
    primaries: {
      bg: "#282a36",
      fg: "f8f8f2",
      accent: "#ff79c6",
      warning: "yellow", // invalid → dropped
      danger: "#ff5555",
    },
  };
  const out = normalizeImportedTheme(input);
  assert.ok(out);
  assert.equal(out!.name, "Dracula");
  assert.equal(out!.scheme, "dark");
  assert.equal(out!.primaries.bg, "#282A36");
  assert.equal(out!.primaries.fg, "#F8F8F2");
  assert.equal(out!.primaries.accent, "#FF79C6");
  assert.equal(out!.primaries.danger, "#FF5555");
  assert.equal(out!.primaries.warning, undefined); // dropped
});

test("normalizeImportedTheme: defaults scheme to dark when missing/invalid", () => {
  assert.equal(normalizeImportedTheme({ name: "X" })!.scheme, "dark");
  assert.equal(
    normalizeImportedTheme({ name: "X", scheme: "purple" as never })!.scheme,
    "dark",
  );
  assert.equal(
    normalizeImportedTheme({ name: "X", scheme: "light" })!.scheme,
    "light",
  );
});

test("normalizeImportedTheme: returns null when nothing usable", () => {
  assert.equal(normalizeImportedTheme({}), null);
  assert.equal(normalizeImportedTheme({ primaries: { bg: "nope" } }), null);
});

test("normalizeImportedTheme: keeps theme when only name is present", () => {
  const out = normalizeImportedTheme({ name: "Solarized" });
  assert.ok(out);
  assert.equal(out!.name, "Solarized");
  assert.equal(out!.scheme, "dark");
  assert.deepEqual(out!.primaries, {});
});

test("normalizeImportedTheme: trims name, empty name ok if primaries exist", () => {
  const out = normalizeImportedTheme({
    name: "   ",
    primaries: { bg: "#000000" },
  });
  assert.ok(out);
  assert.equal(out!.name, "");
  assert.equal(out!.primaries.bg, "#000000");
});
