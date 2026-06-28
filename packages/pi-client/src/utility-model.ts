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

/** Distill a thrown error from `completeSimple` into a short reason for a
 *  warning toast. Recognises credit/quota/billing failures so the user can
 *  tell their utility model is out of credits. */
function describeUtilityError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/insufficient_quota|out of budget|quota exceeded|billing|available balance|usage limit/i.test(msg)) {
    return "Utility model is out of credits or quota exceeded.";
  }
  if (/401|unauthorized|invalid api key|no api key/i.test(msg)) {
    return "Utility model auth failed — check the API key in Settings.";
  }
  return `Utility model call failed: ${msg.slice(0, 120)}`;
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
  /** Invoked with a short human-readable reason when the call fails (no
   *  auth-configured model, request error, non-200). Lets callers surface a
   *  warning toast instead of failing silently. */
  onError?: (message: string) => void;
}

/** A vision content part to attach to the user message. */
export interface UtilityImage {
  /** Raw base64 (no data: prefix). */
  data: string;
  mimeType: string;
}

export interface VisionCompletionOptions {
  systemPrompt: string;
  userText: string;
  /** Optional images appended to the user message (vision-capable model required). */
  images?: UtilityImage[];
  inputLimit?: number;
  temperature?: number;
  maxTokens?: number;
  /** Invoked with a short human-readable reason on failure (see UtilityCompletionOptions). */
  onError?: (message: string) => void;
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

/** Resolve a specific model (provider + id) bypassing the PREFERRED fallback.
 *  Used when the caller wants a particular model (e.g. the configured vision
 *  proxy model) rather than whatever the utility preference list picks. */
export async function resolveSpecificModel(
  config: UtilityModelConfig,
): Promise<ResolvedUtilityModel | null> {
  try {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const registry = sdk.ModelRegistry.create(sdk.AuthStorage.create());
    const model = registry.find(config.provider, config.id);
    if (!model || !registry.hasConfiguredAuth(model)) return null;
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return null;
    return { model, apiKey: auth.apiKey, headers: auth.headers };
  } catch {
    return null;
  }
}

/** One-shot vision completion using a specific model. Images are attached as
 *  content parts; the model must declare vision capability. Returns trimmed
 *  text or null on any failure. */
export async function completeVision(
  config: UtilityModelConfig,
  opts: VisionCompletionOptions,
): Promise<string | null> {
  const resolved = await resolveSpecificModel(config);
  if (!resolved) return null;
  try {
    const ai = await import("@earendil-works/pi-ai");
    const limit = opts.inputLimit ?? 15_000;
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [opts.userText ? { type: "text", text: opts.userText.slice(0, limit) } : null]
      .filter((c): c is { type: "text"; text: string } => c !== null);
    for (const img of opts.images ?? []) {
      content.push({ type: "image", data: img.data, mimeType: img.mimeType });
    }
    const result = await ai.completeSimple(
      resolved.model as Parameters<typeof ai.completeSimple>[0],
      {
        systemPrompt: opts.systemPrompt,
        messages: [{ role: "user", content, timestamp: Date.now() }],
      },
      {
        apiKey: resolved.apiKey,
        headers: resolved.headers,
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 500,
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
