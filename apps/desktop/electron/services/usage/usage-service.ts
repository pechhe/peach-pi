import type { ProviderUsageSummary } from "@peach-pi/shared-types";

import type { Emit } from "../../ipc/registry.ts";
import { KeyedAsyncTtl } from "../ttl-cache.ts";
import { failureNote, type UsageProvider } from "./usage-shared.ts";
import { usageProviders } from "./usage-registry.ts";

const CACHE_TTL_MS = 60_000;

/**
 * Tracks provider spend/usage across subscription plans and pay-per-token
 * providers. The service is inert: it iterates the registered
 * {@link usageProviders} (declared in `usage-registry.ts`), asks each
 * provider's credential source whether it's `configured()`, resolves a
 * credential, then calls `provider.run(cred)`. Per-provider fetch + note
 * logic lives in the provider; raw credentials never reach the renderer.
 *
 * Results are cached per provider for CACHE_TTL_MS; `refresh()` bypasses the
 * cache.
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
      usageProviders.map((provider) =>
        this.cache.run(provider.provider, () => this.buildSummary(provider)),
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

  private async buildSummary(provider: UsageProvider): Promise<ProviderUsageSummary> {
    const configured = await provider.credential.configured();
    // Even when not configured, call run() so the provider returns its
    // actionable set-up note ("run pi login", "add an API key", ...).
    let result;
    try {
      const cred = await provider.credential.resolve();
      result = await provider.run(cred);
    } catch (e) {
      result = { summary: null, state: "unknown" as const, note: failureNote(e) };
    }
    try {
      return {
        provider: provider.provider, label: provider.label, configured,
        summary: result.summary, state: result.state, note: result.note,
        dashboardUrl: provider.dashboardUrl?.() ?? null,
        fetchedAt: result.summary ? new Date().toISOString() : null,
      };
    } catch (e) {
      return {
        provider: provider.provider, label: provider.label, configured,
        summary: null, state: "unknown",
        note: failureNote(e), dashboardUrl: provider.dashboardUrl?.() ?? null,
        fetchedAt: null,
      };
    }
  }
}
