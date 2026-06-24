import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveConfigValue,
  resolveConfigValueOrThrow,
  isConfigValueConfigured,
} from "../../electron/services/resolve-config-value.ts";

test("resolveConfigValue: literal passthrough", () => {
  assert.equal(resolveConfigValue("sk-literal-abc"), "sk-literal-abc");
  assert.equal(resolveConfigValue(undefined), undefined);
  assert.equal(resolveConfigValue(""), undefined);
});

test("resolveConfigValue: $VAR interpolation from env", () => {
  process.env.USAGE_TEST_KEY = "value-from-env";
  assert.equal(resolveConfigValue("$USAGE_TEST_KEY"), "value-from-env");
  assert.equal(resolveConfigValue("prefix-$USAGE_TEST_KEY-suffix"), "prefix-value-from-env-suffix");
  assert.equal(resolveConfigValue("${USAGE_TEST_KEY}"), "value-from-env");
  delete process.env.USAGE_TEST_KEY;
});

test("resolveConfigValue: missing env var → undefined (not a throw)", () => {
  assert.equal(resolveConfigValue("$USAGE_TEST_NEVER_SET_XYZ"), undefined);
  assert.equal(resolveConfigValue("pre-$USAGE_TEST_NEVER_SET_XYZ"), undefined);
});

test("resolveConfigValue: $$ and $! are literal escapes", () => {
  assert.equal(resolveConfigValue("$$"), "$");
  assert.equal(resolveConfigValue("$!"), "!");
  assert.equal(resolveConfigValue("cost:$$5 $!end"), "cost:$5 !end");
});

test("resolveConfigValue: !-prefix executes shell command, trims stdout", () => {
  assert.equal(resolveConfigValue("!printf 'resolved-via-cmd'"), "resolved-via-cmd");
  assert.equal(resolveConfigValue("!printf '  trim-me  \\n'"), "trim-me");
});

test("resolveConfigValue: caches command results", () => {
  // Same command string → executes once, cached on the second call.
  // Use a unique marker to prove it's served from cache (no re-execution).
  const unique = "cache-marker-" + Date.now();
  const cmd = `!printf '${unique}'`;
  assert.equal(resolveConfigValue(cmd), unique);
  assert.equal(resolveConfigValue(cmd), unique);
  // Different command string → re-executes (different cache key).
  assert.equal(resolveConfigValue(`!printf '${unique}-2'`), `${unique}-2`);
});

test("resolveConfigValue: failing/empty command → undefined, no throw", () => {
  assert.equal(resolveConfigValue("!false"), undefined);
  assert.equal(resolveConfigValue("!exit 1"), undefined);
  assert.equal(resolveConfigValue("!printf ''"), undefined);
});

test("resolveConfigValueOrThrow: throws on missing env var", () => {
  assert.throws(
    () => resolveConfigValueOrThrow("$USAGE_TEST_NEVER_SET_XYZ", "test key"),
    /Failed to resolve test key: env var USAGE_TEST_NEVER_SET_XYZ not set/,
  );
});

test("resolveConfigValueOrThrow: throws on failing command", () => {
  assert.throws(
    () => resolveConfigValueOrThrow("!false", "test key"),
    /Failed to resolve test key from shell command/,
  );
});

test("isConfigValueConfigured: !-cmd → true without executing", () => {
  // A command is considered configured if it's present (don't pre-run it).
  assert.equal(isConfigValueConfigured("!/usr/local/bin/some-cmd"), true);
  assert.equal(isConfigValueConfigured("!false"), true);
});

test("isConfigValueConfigured: env var presence (no execution)", () => {
  process.env.USAGE_TEST_PRESENT = "1";
  assert.equal(isConfigValueConfigured("$USAGE_TEST_PRESENT"), true);
  assert.equal(isConfigValueConfigured("prefix-$USAGE_TEST_PRESENT"), true);
  delete process.env.USAGE_TEST_PRESENT;
  assert.equal(isConfigValueConfigured("$USAGE_TEST_ABSENT"), false);
});

test("isConfigValueConfigured: literal must be non-empty", () => {
  assert.equal(isConfigValueConfigured("sk-real-key"), true);
  assert.equal(isConfigValueConfigured(""), false);
  assert.equal(isConfigValueConfigured(undefined), false);
});
