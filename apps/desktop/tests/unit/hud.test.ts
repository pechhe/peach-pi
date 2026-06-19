import { test } from "node:test";
import assert from "node:assert/strict";
import { seedHudThreadId, resolveHudTarget, routeFinishCue } from "@peach-pi/shared-types";

test("seedHudThreadId: keep HUD thread, else fall back to selection, else null", () => {
  // Already tracking a thread → independence: never clobbered by the selection.
  assert.equal(seedHudThreadId("hud-1", "sel-1"), "hud-1");
  // No HUD thread yet → seed from the Main Window selection.
  assert.equal(seedHudThreadId(null, "sel-1"), "sel-1");
  // Nothing selected → null (caller starts a new chat on send).
  assert.equal(seedHudThreadId(null, null), null);
});

test("resolveHudTarget: existing HUD thread wins, missing falls back to new chat", () => {
  assert.equal(resolveHudTarget("t1", ["t1", "t2"]), "t1");
  // HUD thread was deleted → null → caller creates a fresh chat.
  assert.equal(resolveHudTarget("gone", ["t1", "t2"]), null);
  assert.equal(resolveHudTarget(null, ["t1"]), null);
});

test("routeFinishCue: HUD down → system notification (none)", () => {
  assert.deepEqual(
    routeFinishCue({
      finishedThreadId: "t1",
      hudThreadId: "t1",
      hudVisible: false,
      autoRevealOnFinish: true,
    }),
    { kind: "none" },
  );
});

test("routeFinishCue: HUD's own thread → ambient, or expand when auto-reveal on", () => {
  assert.deepEqual(
    routeFinishCue({
      finishedThreadId: "t1",
      hudThreadId: "t1",
      hudVisible: true,
      autoRevealOnFinish: false,
    }),
    { kind: "ambient" },
  );
  assert.deepEqual(
    routeFinishCue({
      finishedThreadId: "t1",
      hudThreadId: "t1",
      hudVisible: true,
      autoRevealOnFinish: true,
    }),
    { kind: "expand" },
  );
});

test("routeFinishCue: a different thread → badge-other (never auto-switch)", () => {
  const cue = routeFinishCue({
    finishedThreadId: "other",
    hudThreadId: "t1",
    hudVisible: true,
    autoRevealOnFinish: true,
  });
  assert.deepEqual(cue, { kind: "badge-other", threadId: "other" });
});
