/** Pure HUD decision logic (no Electron / no DOM). Imported by the main
 *  process, the renderer, and unit tests alike. */

import type { ThreadId } from "./entities.ts";

/**
 * Seed the HUD's active thread when the HUD opens: prefer an already-tracked
 * `hudThreadId` (independence — never clobber it), else fall back to the Main
 * Window's `selectedThreadId`, else null (→ caller starts a new chat on send).
 */
export function seedHudThreadId(
  hudThreadId: ThreadId | null,
  selectedThreadId: ThreadId | null,
): ThreadId | null {
  return hudThreadId ?? selectedThreadId ?? null;
}

/**
 * Resolve the send target for the HUD composer. Returns the HUD's thread when it
 * still exists; otherwise null so the caller creates a fresh chat.
 */
export function resolveHudTarget(
  hudThreadId: ThreadId | null,
  existingThreadIds: readonly ThreadId[],
): ThreadId | null {
  if (hudThreadId && existingThreadIds.includes(hudThreadId)) return hudThreadId;
  return null;
}

/** What a run-finished signal should do, given the HUD's state. */
export type FinishCue =
  | { kind: "none" }
  | { kind: "ambient" }
  | { kind: "expand" }
  | { kind: "badge-other"; threadId: ThreadId };

/**
 * Route a run-finished signal. The HUD never auto-switches its own thread: the
 * only "switch" path is `badge-other`, which arms a badge the user clicks
 * deliberately. When the HUD is down the caller falls back to a system
 * notification (`none`).
 */
export function routeFinishCue(input: {
  finishedThreadId: ThreadId;
  hudThreadId: ThreadId | null;
  hudVisible: boolean;
  autoRevealOnFinish: boolean;
}): FinishCue {
  if (!input.hudVisible) return { kind: "none" };
  if (input.finishedThreadId === input.hudThreadId) {
    return input.autoRevealOnFinish ? { kind: "expand" } : { kind: "ambient" };
  }
  return { kind: "badge-other", threadId: input.finishedThreadId };
}
