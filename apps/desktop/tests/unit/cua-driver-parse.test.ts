import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDaemonRunning, parsePermission, parseVersion } from "../../electron/services/cua-driver-parse.ts";

test("parsePermission: granted via emoji", () => {
  const out = "✅ Accessibility: granted.\n✅ Screen Recording: granted.";
  assert.equal(parsePermission(out, "Accessibility"), "granted");
  assert.equal(parsePermission(out, "Screen Recording"), "granted");
});

test("parsePermission: denied and unknown", () => {
  assert.equal(parsePermission("❌ Accessibility: denied.", "Accessibility"), "denied");
  assert.equal(parsePermission("❓ Accessibility: unknown.", "Accessibility"), "unknown");
});

test("parsePermission: missing label → unknown", () => {
  assert.equal(parsePermission("nothing here", "Accessibility"), "unknown");
});

test("parseVersion: extracts semver (bare + prefixed)", () => {
  assert.equal(parseVersion("0.2.0"), "0.2.0"); // v0.2.0 prints bare
  assert.equal(parseVersion("cua-driver 0.5.1-beta (aarch64-macos)"), "0.5.1-beta");
});

test("parseVersion: no match → null", () => {
  assert.equal(parseVersion("command not found"), null);
});

test("parseDaemonRunning: running vs not", () => {
  assert.equal(parseDaemonRunning("cua-driver daemon is running (pid 123)"), true);
  assert.equal(parseDaemonRunning("cua-driver daemon is not running"), false);
  assert.equal(parseDaemonRunning(""), false);
});
