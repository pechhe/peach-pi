import { api } from "../lib/ipc";
import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/**
 * Cross-provider usage: subscription quota windows (Anthropic, Z.ai) and
 * pay-per-token balance/spend (OpenRouter, NeuralWatt) shown side by side.
 * Loads on open; refreshes on the periodic timer and on `event:usageChanged`.
 */
class UsageStore {
  summaries = $state<ProviderUsageSummary[]>([]);
  loading = $state(false);
  refreshing = $state(false);
  error = $state("");
  private poll: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      this.summaries = await api.invoke("usage:list");
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    this.refreshing = true;
    this.error = "";
    try {
      this.summaries = await api.invoke("usage:refresh");
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.refreshing = false;
    }
  }

  /** Start the ~60s auto-refresh; stops on `stop()` (view unmount). */
  startPolling(): void {
    this.stopPolling();
    this.poll = setInterval(() => void this.load(), 60_000);
  }

  stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}

export const usage = new UsageStore();
