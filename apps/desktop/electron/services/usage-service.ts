import type { ProviderUsageSummary } from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";
import { KeyedAsyncTtl } from "./ttl-cache.ts";
import { failureNote, type UsageAdapter, type AdapterCtor } from "./usage-shared.ts";
import { ZaiAdapter, OpenRouterAdapter, NeuralWattAdapter } from "./usage-adapters.ts";
import { AnthropicAdapter } from "./usage-anthropic-adapter.ts";
import { XiaomiMiMoAdapter } from "./usage-mimo-adapter.ts";

const CACHE_TTL_MS = 60_000;

/** Provider id → adapter constructor, in display order. Defined here (not in
 *  usage-adapters.ts) to avoid a circular import: usage-anthropic-adapter.ts
 *  imports shared helpers from usage-shared.ts, while usage-adapters.ts holds
 *  the HTTP adapters. */
const ADAPTERS: { provider: string; ctor: AdapterCtor }[] = [
  { provider: "anthropic", ctor: AnthropicAdapter },
  { provider: "zai", ctor: ZaiAdapter },
  { provider: "xiaomi", ctor: XiaomiMiMoAdapter },
  { provider: "openrouter", ctor: OpenRouterAdapter },
  { provider: "neuralwatt", ctor: NeuralWattAdapter },
];

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
    // Even when not configured, call fetch() so the adapter returns its
    // actionable set-up note ("run pi login", "add an API key", ...). Adapters
    // short-circuit cheaply in that case and never touch the network.
    try {
      const result = await adapter.fetch();
      return {
        provider, label: adapter.label, configured,
        summary: result.summary, state: result.state, note: result.note,
        dashboardUrl: adapter.dashboardUrl?.() ?? null,
        fetchedAt: result.summary ? new Date().toISOString() : null,
      };
    } catch (e) {
      return {
        provider, label: adapter.label, configured,
        summary: null, state: "unknown",
        note: failureNote(e), dashboardUrl: adapter.dashboardUrl?.() ?? null,
        fetchedAt: null,
      };
    }
  }
}
