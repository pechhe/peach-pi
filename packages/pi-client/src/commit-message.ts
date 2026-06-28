/**
 * One-shot LLM commit message generation (port of peche-pi's semi-auto
 * commit). Uses the shared utility-model resolution so the app's configured
 * "utility" model is honoured when set.
 */

import { completeUtility, type UtilityModelConfig } from "./utility-model.ts";

const SYSTEM_PROMPT = [
  "You write git commit messages. Reply with a single-line conventional commit",
  "message (feat/fix/chore/refactor/docs/style/test/perf/ci/build), imperative",
  "mood, max 72 chars. Reply with the message only — no quotes, no prose.",
].join(" ");

const DIFF_LIMIT = 15_000;

export async function generateCommitMessage(
  diff: string,
  config?: UtilityModelConfig | null,
  onError?: (message: string) => void,
): Promise<string | null> {
  const text = await completeUtility(config, {
    systemPrompt: SYSTEM_PROMPT,
    userText: `Staged diff:\n\n${diff}`,
    inputLimit: DIFF_LIMIT,
    temperature: 0.3,
    maxTokens: 200,
    onError,
  });
  // Commit messages must be a single line; collapse any stray wrapping.
  return text?.split("\n")[0]?.trim() || null;
}
