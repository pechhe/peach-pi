import type { ProviderUsageSummary } from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";
import { KeyedAsyncTtl } from "./ttl-cache.ts";
import { ADAPTERS, type UsageAdapter } from "./usage-adapters.ts";

const CACHE_TTL_MS = 60_000;

/**
 * Tracks provider spend/usage across subscription plans and pay-per-token
 * providers. Each adapter (see usage-adapters.ts) reads its provider's
 * credentials from `~/.pi/agent/models.json` and fetches live status:
 *
 *  - Anthropic / Z.ai → subscription quota windows (5h + weekly)
 *  - OpenRouter / NeuralWatt → $ balance / spend / energy
 *
 * Raw API keys never reach the renderer. Results are cached per provider for
 * CACHE_TTL_MS; `refresh()` bypasses the cache.
 */
export class UsageService {
  private cache = new KeyedAsyncTtl<ProviderUsageSummary>(CACHE_TTL_MS);
  private emit: Emit;

  constructor(emit: Emit) {
    this.emit = emit;
  }

  /** All configured providers' summaries (one card each). */
  async list(): Promise<ProviderUsageSummary[]> {
    return Promise.all(
      ADAPTERS.map(({ provider, ctor }) =>
        this.cache.run(provider, () => this.buildSummary(provider, new ctor())),
      ),
    );
  }

  /** Force a fresh fetch now, bypassing the cache. */
  async refresh(): Promise<ProviderUsageSummary[]> {
    this.cache.clear();
    const summaries = await this.list();
    this.emit("event:usageChanged", undefined);
    return summaries;
  }

  private async buildSummary(provider: string, adapter: UsageAdapter): Promise<ProviderUsageSummary> {
    const configured = await adapter.configured();
    if (!configured) {
      return { provider, label: adapter.label, configured: false, summary: null, state: "unknown", note: null, fetchedAt: null };
    }
    try {
      const result = await adapter.fetch();
      return {
        provider, label: adapter.label, configured: true,
        summary: result.summary, state: result.state, note: result.note,
        fetchedAt: result.summary ? new Date().toISOString() : null,
      };
    } catch {
      return { provider, label: adapter.label, configured: true, summary: null, state: "unknown", note: null, fetchedAt: null };
    }
  }
}
