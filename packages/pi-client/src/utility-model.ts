/**
 * Shared "utility model" resolution + one-shot completion.
 *
 * Used for background LLM tasks (thread titles, commit messages) where a
 * fast/utility model is preferred over the user's main session model. The app
 * persists a configured selection (settings); when absent we fall back to a
 * preference list, then the first auth-configured model.
 */

import { scopeModels } from "./scope-models.ts";

/** A utility model selection, persisted by the app under the "utility-model" kv key. */
export interface UtilityModelConfig {
  provider: string;
  id: string;
}

/** Utility-and-fast preference order; used when nothing is configured. */
const PREFERRED: Array<[provider: string, modelId: string]> = [
  ["anthropic", "claude-haiku-4-5"],
  ["openai", "gpt-5-mini"],
  ["deepseek", "deepseek-chat"],
];

export interface ResolvedUtilityModel {
  model: unknown;
  apiKey?: string;
  headers?: Record<string, string>;
}

/** All auth-configured models, scoped by the global enabledModels setting (settings.json). */
export async function listAvailableModels(): Promise<
  Array<{ provider: string; id: string; name: string }>
> {
  try {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const authStorage = sdk.AuthStorage.create();
    const registry = sdk.ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    // Scope exactly like pi's `/model`: global enabledModels patterns.
    const settings = sdk.SettingsManager.create(process.cwd(), sdk.getAgentDir());
    const scoped = scopeModels(available, settings.getEnabledModels());
    return scoped.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
    }));
  } catch {
    return [];
  }
}

/**
 * Resolve a utility model. A configured selection wins; otherwise the PREFERRED
 * list is tried, then the first available configured model. Returns null when
 * no model has auth configured (caller should fall back to a static value).
 */
export async function resolveUtilityModel(
  config?: UtilityModelConfig | null,
): Promise<ResolvedUtilityModel | null> {
  try {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const registry = sdk.ModelRegistry.create(sdk.AuthStorage.create());

    const pick = (provider: string, id: string) => {
      const m = registry.find(provider, id);
      return m && registry.hasConfiguredAuth(m) ? m : undefined;
    };

    let model = config ? pick(config.provider, config.id) : undefined;
    if (!model) {
      for (const [provider, id] of PREFERRED) {
        model = pick(provider, id);
        if (model) break;
      }
    }
    model ??= registry.getAvailable()[0];
    if (!model) return null;

    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return null;
    return { model, apiKey: auth.apiKey, headers: auth.headers };
  } catch {
    return null;
  }
}

export interface UtilityCompletionOptions {
  systemPrompt: string;
  userText: string;
  /** Truncate user text to this many chars before sending (default 15_000). */
  inputLimit?: number;
  temperature?: number;
  maxTokens?: number;
}

/** One-shot utility completion; returns trimmed text or null on any failure. */
export async function completeUtility(
  config: UtilityModelConfig | null | undefined,
  opts: UtilityCompletionOptions,
): Promise<string | null> {
  const resolved = await resolveUtilityModel(config);
  if (!resolved) return null;
  try {
    const ai = await import("@earendil-works/pi-ai");
    const limit = opts.inputLimit ?? 15_000;
    const result = await ai.completeSimple(
      resolved.model as Parameters<typeof ai.completeSimple>[0],
      {
        systemPrompt: opts.systemPrompt,
        messages: [
          {
            role: "user",
            content: opts.userText.slice(0, limit),
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: resolved.apiKey,
        headers: resolved.headers,
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 200,
      },
    );
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}
