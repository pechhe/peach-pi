import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../../electron/services/pi-health.ts";

test("ok when every extension's resolved SDK matches the host", () => {
  const h = evaluateHealth("0.79.6", [
    { id: "git:github.com/edxeth/pi-subagents", resolvedSdk: "0.79.6", peerRange: ">=0.79.0" },
    { id: "npm:pi-cymbal", resolvedSdk: "0.79.6", peerRange: "*" },
  ]);
  assert.equal(h.status, "ok");
  assert.deepEqual(h.problems, []);
});

test("version drift (resolved SDK ≠ host) is a warning even when peer range is satisfied", () => {
  // The exact 0.79.1-vs-0.79.6 case: peer `>=0.79.0` is satisfied by 0.79.1,
  // yet the extension was built against 0.79.6 → flag it.
  const h = evaluateHealth("0.79.1", [
    { id: "git:github.com/edxeth/pi-subagents", resolvedSdk: "0.79.6", peerRange: ">=0.79.0" },
  ]);
  assert.equal(h.status, "warning");
  assert.equal(h.extensions[0]!.issue, "version-drift");
  assert.equal(h.extensions[0]!.level, "warning");
  assert.match(h.problems[0]!, /built against pi 0\.79\.6.*bundles 0\.79\.1/);
});

test("peer-range violation is a hard error", () => {
  const h = evaluateHealth("0.79.6", [
    { id: "npm:pi-tool-display", resolvedSdk: "0.75.4", peerRange: "^0.74.0 || ^0.75.0" },
  ]);
  assert.equal(h.status, "error");
  assert.equal(h.extensions[0]!.issue, "peer-violation");
  assert.match(h.problems[0]!, /requires pi \^0\.74\.0 \|\| \^0\.75\.0.*bundles 0\.79\.6/);
});

test("error wins over warning in overall status", () => {
  const h = evaluateHealth("0.79.6", [
    { id: "a", resolvedSdk: "0.79.5", peerRange: null }, // drift → warning
    { id: "b", resolvedSdk: null, peerRange: "^0.80.0" }, // violation → error
  ]);
  assert.equal(h.status, "error");
});

test("unknown facts (null SDK, '*' or null peer) never flag", () => {
  const h = evaluateHealth("0.79.6", [
    { id: "a", resolvedSdk: null, peerRange: "*" },
    { id: "b", resolvedSdk: null, peerRange: null },
  ]);
  assert.equal(h.status, "ok");
});

test("null host version is treated as unknown, not a failure", () => {
  const h = evaluateHealth(null, [
    { id: "a", resolvedSdk: "0.79.6", peerRange: ">=0.79.0" },
  ]);
  assert.equal(h.status, "ok");
});
