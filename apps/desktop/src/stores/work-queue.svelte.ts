import { api } from "../lib/ipc";
import type { WorkQueueResult } from "@peach-pi/shared-types";

/**
 * Per-project Work Queue: the project's open tracker issues. Business logic
 * (fetch, adapter selection, parsing) lives in main; this store just holds the
 * last `workQueue:list` result for the renderer to paint. Reloads when the
 * viewed project changes or the user refreshes.
 */
class WorkQueueStore {
  result = $state<WorkQueueResult | null>(null);
  loading = $state(false);
  projectId = $state<string | null>(null);
  /** Open-issue counts for the sidebar badge, keyed by project id. Loaded
   *  once on mount via {@link loadCounts} and refreshed alongside the Work
   *  Queue view. Always a number (0 means zero issues or fetch failure). */
  counts = $state<Map<string, number>>(new Map());

  async load(projectId: string | null): Promise<void> {
    this.projectId = projectId;
    this.result = null;
    if (!projectId) return;
    this.loading = true;
    try {
      const res = await api.invoke("workQueue:list", projectId);
      // Ignore a stale response if the viewed project changed mid-flight.
      if (this.projectId === projectId) this.result = res;
    } finally {
      if (this.projectId === projectId) this.loading = false;
    }
  }

  /** Fetch open-issue counts for every repo project. Best-effort: failures and
   *  non-GitHub projects land as 0. Called once on mount. */
  async loadCounts(projectIds: string[]): Promise<void> {
    await Promise.all(
      projectIds.map(async (id) => {
        const res = await api.invoke("workQueue:openCount", id);
        this.counts.set(id, res.ok ? res.count : 0);
        // Reassign to trigger reactivity across the Map.
        this.counts = new Map(this.counts);
      }),
    );
  }

  /** Count for a single project (cached). 0 when unknown / not fetched. */
  countFor(projectId: string): number {
    return this.counts.get(projectId) ?? 0;
  }
}

export const workQueue = new WorkQueueStore();
