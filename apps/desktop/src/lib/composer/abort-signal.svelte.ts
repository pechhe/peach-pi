/**
 * Renderer-local record of threads the user just aborted via Esc.
 *
 * `threads:abort` and a natural finish both land on status `"idle"`, so the
 * App done-chime can't tell them apart. Composer marks the thread here right
 * before aborting; App reads (and consumes) the mark to suppress the chime.
 */
const aborted = new Set<string>();

export function markAborted(threadId: string): void {
  aborted.add(threadId);
}

/** True (once) if this thread was aborted and the mark hasn't been consumed. */
export function consumeAborted(threadId: string): boolean {
  if (aborted.has(threadId)) {
    aborted.delete(threadId);
    return true;
  }
  return false;
}
