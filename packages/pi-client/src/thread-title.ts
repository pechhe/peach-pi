/**
 * One-shot LLM thread title generation from the user's first prompt.
 * Uses the shared utility-model resolution so the app's configured "utility"
 * model is honoured when set.
 */

import { completeUtility, type UtilityModelConfig } from "./utility-model.ts";

const SYSTEM_PROMPT = [
  "You write short titles for chat threads. Given a user's first message, reply",
  "with a concise title (3-6 words, max 60 chars), sentence case, no trailing",
  "punctuation, no quotes. Reply with the title only.",
].join(" ");

const PROMPT_LIMIT = 2_000;

/** Generate a short title from the user's first message. Returns null on failure. */
export async function generateThreadTitle(
  firstPrompt: string,
  config?: UtilityModelConfig | null,
): Promise<string | null> {
  const text = await completeUtility(config, {
    systemPrompt: SYSTEM_PROMPT,
    userText: firstPrompt,
    inputLimit: PROMPT_LIMIT,
    temperature: 0.4,
    maxTokens: 24,
  });
  const title = text?.split("\n")[0]?.trim();
  if (!title) return null;
  // Hard cap so a misbehaving model can't blow out the sidebar.
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}
