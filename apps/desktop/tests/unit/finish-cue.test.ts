import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFinishCue } from "../../electron/services/finish-cue.ts";

/**
 * Candidate 2 (RunLifecycle seam) — the finish-cue routing rule is pure over
 * (status, hudUp, appFocused), so the HUD-vs-notification-vs-nothing decision
 * is unit-testable without Electron. These cases lock the behaviour the former
 * `onRunIdle` constructor lambda encoded inline (which was not testable).
 *
 * Rule (preserved exactly from the old inline lambda):
 *   - only a clean completion cues (a failed run does not),
 *   - HUD owns the screen → route to the HUD,
 *   - app focused → no cue (the user is already watching),
 *   - backgrounded → system notification.
 */
test("routeFinishCue: clean completion → HUD when the HUD owns the screen", () => {
  assert.equal(routeFinishCue("completed", true, false), "hud");
  // HUD wins even if the main window also happens to be focused.
  assert.equal(routeFinishCue("completed", true, true), "hud");
});

test("routeFinishCue: clean completion, backgrounded → notify", () => {
  assert.equal(routeFinishCue("completed", false, false), "notify");
});

test("routeFinishCue: clean completion, app focused → no cue (user is watching)", () => {
  assert.equal(routeFinishCue("completed", false, true), null);
});

test("routeFinishCue: a failed run never cues (surfaces via the transcript instead)", () => {
  assert.equal(routeFinishCue("failed", true, false), null);
  assert.equal(routeFinishCue("failed", false, false), null);
});

test("routeFinishCue: a run starting (running) never cues", () => {
  assert.equal(routeFinishCue("running", true, false), null);
  assert.equal(routeFinishCue("running", false, false), null);
});
