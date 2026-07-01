import type { ThreadId, ThreadStatus } from "@peach-pi/shared-types";

/** A finished thread the notch can list + open. */
export type NotchThread = { id: ThreadId; title: string };

/** What the notch surface should show right now. `visible` folds the
 *  "only show when something's running/finished" rule so the helper never
 *  decides visibility itself. */
export type NotchState = { running: number; completed: NotchThread[]; visible: boolean };

/** A run finished cleanly → pop a notch toast. Only a clean `completed`
 *  transition cues (mirrors `routeFinishCue`): `failed`/`idle`/`running` never
 *  do, and re-entering `completed` without having left it never re-fires. */
export function isNotchFinish(status: ThreadStatus, prev: ThreadStatus): boolean {
  return status === "completed" && prev !== "completed";
}

/** Fold one status transition into the unread-completed inbox. Pure: returns a
 *  new set, never mutates the input, so it composes like a reducer.
 *   - clean completion → add (unread finished, awaiting the user),
 *   - anything that is not `completed` (running/idle/failed) → drop (a finish
 *     that no longer stands, or a run that just (re)started). */
export function reduceInbox(
  unread: ReadonlySet<ThreadId>,
  id: ThreadId,
  status: ThreadStatus,
  prev: ThreadStatus,
): Set<ThreadId> {
  const next = new Set(unread);
  if (isNotchFinish(status, prev)) next.add(id);
  else if (status !== "completed") next.delete(id);
  return next;
}

/** Derive the notch surface from the live thread list + the unread inbox.
 *  Running count is always live (from the snapshot); completed = unread finished
 *  threads that still exist (inbox ids whose thread is gone are dropped). */
export function computeNotchState(
  threads: readonly { id: ThreadId; title: string; status: ThreadStatus }[],
  unread: ReadonlySet<ThreadId>,
): NotchState {
  const running = threads.filter((t) => t.status === "running").length;
  const completed = threads
    .filter((t) => unread.has(t.id))
    .map((t) => ({ id: t.id, title: t.title }));
  return { running, completed, visible: running > 0 || completed.length > 0 };
}
