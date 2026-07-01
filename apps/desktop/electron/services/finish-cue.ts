import type { ThreadStatus } from "@peach-pi/shared-types";

/** Where a finished run's cue should land. The routing decision is kept pure
 *  over its inputs (no Electron globals) so it is unit-testable; the Electron
 *  bits (focused-window, Notification support) are read by the caller and
 *  folded into the arguments. */
export type FinishCueRoute = "hud" | "notify" | null;

/** Decide where a finished run's cue goes: the HUD (when it owns the screen),
 *  a macOS notification (when the app is backgrounded), or nowhere (user is
 *  watching, or the run didn't finish cleanly).
 *
 *  Only clean completions cue — a failed run surfaces via the transcript, not a
 *  finish toast. This preserves the former `onRunIdle` gate (`status ===
 *  "completed"`). */
export function routeFinishCue(
  status: ThreadStatus,
  hudUp: boolean,
  appFocused: boolean,
): FinishCueRoute {
  if (status !== "completed") return null;
  if (hudUp) return "hud";
  if (appFocused) return null;
  return "notify";
}
