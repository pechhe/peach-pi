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
}

export const workQueue = new WorkQueueStore();
