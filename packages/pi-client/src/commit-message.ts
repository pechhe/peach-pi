/**
 * One-shot LLM commit message generation (port of peche-pi's semi-auto
 * commit). Uses pi's auth/model registry, so any provider the user has
 * configured for pi works here too.
 */

const SYSTEM_PROMPT = [
  "You write git commit messages. Reply with a single-line conventional commit",
  "message (feat/fix/chore/refactor/docs/style/test/perf/ci/build), imperative",
  "mood, max 72 chars. Reply with the message only — no quotes, no prose.",
].join(" ");

const DIFF_LIMIT = 15_000;

/** Cheap-and-fast preference order; falls back to any available model. */
const PREFERRED: Array<[provider: string, modelId: string]> = [
  ["anthropic", "claude-haiku-4-5"],
  ["openai", "gpt-5-mini"],
  ["deepseek", "deepseek-chat"],
];

export async function generateCommitMessage(diff: string): Promise<string | null> {
  try {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const ai = await import("@earendil-works/pi-ai");
    const registry = sdk.ModelRegistry.create(sdk.AuthStorage.create());

    let model = null;
    for (const [provider, id] of PREFERRED) {
      const candidate = registry.find(provider, id);
      if (candidate && registry.hasConfiguredAuth(candidate)) {
        model = candidate;
        break;
      }
    }
    model ??= registry.getAvailable()[0] ?? null;
    if (!model) return null;

    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return null;

    const result = await ai.completeSimple(
      model,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Staged diff:\n\n${diff.slice(0, DIFF_LIMIT)}`,
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: auth.apiKey, headers: auth.headers, temperature: 0.3, maxTokens: 200 },
    );
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .split("\n")[0]
      ?.trim();
    return text || null;
  } catch {
    return null; // caller falls back to a static message
  }
}
