import { api } from "../lib/ipc";
import type { MergeProgressPayload } from "@peach-pi/shared-types";

/**
 * Merge Queue: tracks a `workQueue:mergeBatch` run in flight. The renderer
 * subscribes to `event:mergeProgress` (fired by main per issue) and exposes a
 * `byIssue` map keyed by issue number so the Work Queue can paint live per-item
 * status (`rebasing` → `testing` → `merged` / `conflict`) without reloading.
 *
 * Kept separate from `workQueue` (the issue-list store) so a batch run does
 * not thrash the full issues refresh on every item; the Work Queue reloads once
 * at the end of a batch instead.
 */
class MergeQueueStore {
  /** Issue number → latest progress payload for the active batch. */
  byIssue = $state<Map<number, MergeProgressPayload>>(new Map());
  /** Project id of the running batch; null when idle. */
  runningFor = $state<string | null>(null);

  constructor() {
    api.on("event:mergeProgress", (p) => {
      if (p.done) {
        this.byIssue.set(p.issueNumber, p);
      } else {
        this.byIssue.set(p.issueNumber, p);
      }
      // Force reactivity: reassign the Map reference.
      this.byIssue = new Map(this.byIssue);
    });
  }

  get inProgress(): boolean {
    return this.runningFor !== null;
  }

  /** Start a batch merge for the given issues in the chosen order. Returns
   *  when the whole batch is done (the result is also streamed via events). */
  async run(projectId: string, issueNumbers: number[], opts?: { stashLocal?: boolean }): Promise<void> {
    this.runningFor = projectId;
    this.byIssue = new Map();
    try {
      await api.invoke("workQueue:mergeBatch", projectId, issueNumbers, opts);
      // Handled lazily by the caller's workQueue.reload() — no-op here.
    } finally {
      this.runningFor = null;
    }
  }

  /** Clear progress state after the UI has consumed it (e.g. on reload). */
  reset(): void {
    this.byIssue = new Map();
  }
}

export const mergeQueue = new MergeQueueStore();
