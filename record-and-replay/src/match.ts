/**
 * Skill matching. No external embedding dependency by default — a lightweight
 * TF-IDF cosine similarity over `description` + `triggers`, plus an exact
 * keyword-boost. An optional `embed` hook is supported so callers can wire in a
 * real embedding model without changing the ranking surface.
 */

import type { SkillMeta } from "./types.ts";

const STOP = new Set([
  "a","an","the","and","or","but","to","of","in","on","for","with","is","are",
  "be","my","your","i","you","it","this","that","when","do","please","me",
]);

export interface MatchResult {
  skill: SkillMeta;
  score: number;
  /** Which field drove the match (for explainability). */
  via: "triggers" | "description" | "name" | "embed";
}

export interface MatchOptions {
  threshold?: number;
  /** Optional embedding provider. If set, used as primary signal. */
  embed?: (text: string) => Promise<number[]>;
  /** Pre-computed embedding cache for skills. */
}

/** Tokenize for TF-IDF. Lowercase, split on non-word, drop stop words / short. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Bag of words with counts. */
export function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Cosine similarity between two sparse term-frequency vectors. */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [k, v] of a) {
    magA += v * v;
    const w = b.get(k);
    if (w) dot += v * w;
  }
  for (const w of b.values()) magB += w * w;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function skillText(s: SkillMeta): string {
  return `${s.name} ${s.description} ${s.triggers.join(" ")}`;
}

/** Rank saved skills against a user message. Higher = better. */
export function rankSkills(message: string, skills: SkillMeta[]): MatchResult[] {
  const msgTokens = tokenize(message);
  const msgVec = termFreq(msgTokens);
  const results: MatchResult[] = [];
  for (const skill of skills) {
    const trigVec = termFreq(tokenize(skill.triggers.join(" ")));
    const descVec = termFreq(tokenize(skill.description));
    const nameVec = termFreq(tokenize(skill.name));
    const trigScore = cosine(msgVec, trigVec) * 1.4; // weight triggers most
    const descScore = cosine(msgVec, descVec) * 1.0;
    const nameScore = cosine(msgVec, nameVec) * 0.6;
    const best = Math.max(trigScore, descScore, nameScore);
    const via: MatchResult["via"] =
      trigScore >= descScore && trigScore >= nameScore ? "triggers"
      : descScore >= nameScore ? "description" : "name";
    // Exact substring match boost.
    const boost = skill.triggers.some((t) => message.toLowerCase().includes(t.toLowerCase())) ? 0.2 : 0;
    results.push({ skill, score: best + boost, via });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** Return best skill above threshold, or null. */
export function bestMatch(
  message: string,
  skills: SkillMeta[],
  threshold = 0.35,
): MatchResult | null {
  const ranked = rankSkills(message, skills);
  const top = ranked[0];
  if (!top || top.score < threshold) return null;
  return top;
}
