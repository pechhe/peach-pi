import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildCustomCss,
  CUSTOM_THEME_ID,
  HEX_RE,
  THEMES,
  THEME_TOKENS,
  THEME_TOKEN_GROUPS,
} from "../../src/lib/theme-tokens.ts";

const cssPath = fileURLToPath(
  new URL("../../src/styles/app.css", import.meta.url),
);
const appCss = readFileSync(cssPath, "utf8");

// The `@theme` block in app.css defines all valid `--color-<id>` tokens. The
// token catalog is the editor's source of truth, so its ids must match.
function extractThemeTokenIds(css: string): string[] {
  const body = css.slice(css.indexOf("@theme"), css.indexOf("}"));
  return [...body.matchAll(/--color-([a-z0-9-]+)\s*:/g)]
    .map((m) => m[1])
    .filter((id): id is string => typeof id === "string");
}

test("buildCustomCss: empty / falsy maps produce no rule", () => {
  assert.equal(buildCustomCss({}), "");
  assert.equal(buildCustomCss({ "": "#fff" }), "");
});

test("buildCustomCss: valid hex (with/without #) emits a rule per token", () => {
  const css = buildCustomCss({ bg: "#101012", accent: "38bdf8" });
  assert.match(css, /:root\[data-custom="true"\]/);
  assert.match(css, /--color-bg: #101012;/);
  assert.match(css, /--color-accent: #38bdf8;/); // leading # added
});

test("buildCustomCss: 3/6/8-digit hex all accepted; invalid values dropped", () => {
  const css = buildCustomCss({
    fg: "#abc", // 3-digit ok
    border: "#11223344", // 8-digit ok
    bad: "not-a-color", // dropped
    "border-focus": "abcDEF", // 6-digit ok
  });
  assert.match(css, /--color-fg: #abc;/);
  assert.match(css, /--color-border: #11223344;/);
  assert.match(css, /--color-border-focus: #abcDEF;/);
  assert.doesNotMatch(css, /not-a-color/);
});

test("HEX_RE: accepts 3–8 hex with optional #, rejects non-hex / empty", () => {
  // 3, 4, 5, 6, 8 hex digits are all accepted (real-world hex is 3/6/8;
  // looser upper bound is harmless and lenient on user typing).
  for (const ok of ["#fff", "fff", "#abcd", "abcdef", "#11223344", "abcDEF", "12345"]) {
    assert.ok(HEX_RE.test(ok), `expected ok: ${ok}`);
  }
  for (const bad of ["", "zzz", "#ggg", "##fff", "#12", "#1122334455"]) {
    assert.ok(!HEX_RE.test(bad), `expected reject: ${bad}`);
  }
});

test("THEME_TOKENS ids match the @theme tokens in app.css exactly", () => {
  const cssIds = extractThemeTokenIds(appCss);
  const catalogIds = THEME_TOKENS.map((t) => t.id);
  assert.deepEqual([...catalogIds].sort(), [...cssIds].sort());
});

test("THEME_TOKENS: every token belongs to a known, ordered group", () => {
  for (const t of THEME_TOKENS) {
    assert.ok(
      THEME_TOKEN_GROUPS.includes(t.group),
      `token ${t.id} has unknown group ${t.group}`,
    );
  }
  assert.ok(THEME_TOKEN_GROUPS.length === new Set(THEME_TOKEN_GROUPS).size);
});

test("THEMES + CUSTOM_THEME_ID are consistent", () => {
  // Custom id must not collide with a preset id.
  assert.ok(!THEMES.some((t) => t.id === CUSTOM_THEME_ID));
  // Each preset carries an explicit scheme.
  for (const t of THEMES) {
    assert.ok(t.scheme === "dark" || t.scheme === "light");
  }
});
