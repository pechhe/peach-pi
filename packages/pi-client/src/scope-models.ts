/**
 * Mirrors pi's `/model` scoping: keep only models matching the
 * `enabledModels` patterns (settings.json), in pattern order.
 *
 * Shared by the composer model selector (per-session) and the app-level
 * utility-model picker so they show the same model set.
 */

/** Thinking-level suffixes pi allows on enabled-model patterns (e.g. "zai/glm-5.2:high"). */
export const THINKING_SUFFIXES = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

/** Strip an optional `:thinkingLevel` suffix from an enabled-model pattern. */
export function stripThinkingSuffix(pattern: string): string {
  const colon = pattern.lastIndexOf(":");
  return colon !== -1 && THINKING_SUFFIXES.has(pattern.slice(colon + 1).toLowerCase())
    ? pattern.slice(0, colon)
    : pattern;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}

/**
 * Keep only models matching the patterns, in pattern order. Matches
 * `provider/id` or `id`, supports `*`/`?` globs, and strips an optional
 * `:thinkingLevel` suffix. No patterns (or empty) → all models.
 */
export function scopeModels<T extends { provider: string; id: string }>(
  available: T[],
  patterns: string[] | undefined,
): T[] {
  if (!patterns || patterns.length === 0) return available;
  const picked: T[] = [];
  for (const raw of patterns) {
    const re = globToRegExp(stripThinkingSuffix(raw));
    for (const m of available) {
      if ((re.test(`${m.provider}/${m.id}`) || re.test(m.id)) && !picked.includes(m)) picked.push(m);
    }
  }
  return picked;
}
