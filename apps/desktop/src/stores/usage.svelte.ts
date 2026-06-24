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
  private loaded = false;
  private started = false;

  async load(): Promise<void> {
    if (this.loaded && this.summaries.length > 0 && !this.loading) return;
    this.loading = true;
    this.error = "";
    try {
      this.summaries = await api.invoke("usage:list");
      this.loaded = true;
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

  /** App-wide init: load once, listen for live updates, start polling.
   *  Call from App onMount so the sidebar metric line has data without
   *  opening the Usage view. Idempotent. */
  init(): void {
    if (this.started) return;
    this.started = true;
    void this.load();
    api.on("event:usageChanged", () => void this.load());
    this.startPolling();
  }
}

export const usage = new UsageStore();
