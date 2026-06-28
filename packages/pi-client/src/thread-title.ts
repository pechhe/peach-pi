/**
 * One-shot LLM thread title + tag classification from the user's first prompt.
 * Uses the shared utility-model resolution so the app's configured "utility"
 * model is honoured when set. Title and tag come from a single completion.
 */

import { THREAD_TAGS, type ThreadTag } from "@peach-pi/shared-types";
import { completeUtility, type UtilityModelConfig } from "./utility-model.ts";

const SYSTEM_PROMPT = [
  "You label chat threads for a coding agent. Given a user's first message,",
  "reply with ONE line of JSON only, no markdown, in this exact shape:",
  '{"title":"...","tag":"..."}',
  "title: very concise, 2-4 words, max 35 chars, sentence case, no trailing",
  "punctuation, no quotes.",
  `tag: one of ${THREAD_TAGS.join(", ")}.`,
  "feature = new functionality; bugfix = fixing broken behaviour;",
  "refactor = restructuring without behaviour change; docs = documentation or",
  "comments; chore = deps/config/build/setup; other = anything else.",
].join(" ");

const PROMPT_LIMIT = 2_000;

export interface ThreadTitleAndTag {
  title: string;
  tag: ThreadTag;
}

const isTag = (v: unknown): v is ThreadTag =>
  typeof v === "string" && (THREAD_TAGS as readonly string[]).includes(v);

const capTitle = (t: string): string => (t.length > 35 ? `${t.slice(0, 34)}…` : t);

export interface ThreadTitleOptions {
  /** Utility-model override; falls back to the app's configured selection. */
  config?: UtilityModelConfig | null;
  /** Invoked when the underlying utility call fails, with a short reason. */
  onError?: (message: string) => void;
}

/**
 * Generate a short title and category tag from the user's first message in a
 * single utility-model call. Returns null on failure; a missing/invalid tag
 * falls back to "other".
 */
export async function generateTitleAndTag(
  firstPrompt: string,
  opts: ThreadTitleOptions = {},
): Promise<ThreadTitleAndTag | null> {
  const text = await completeUtility(opts.config, {
    systemPrompt: SYSTEM_PROMPT,
    userText: firstPrompt,
    inputLimit: PROMPT_LIMIT,
    temperature: 0.4,
    maxTokens: 48,
    onError: opts.onError,
  });
  if (!text) return null;

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const obj = parsed as { title?: unknown; tag?: unknown };
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return null;
  return { title: capTitle(title), tag: isTag(obj.tag) ? obj.tag : "other" };
}
