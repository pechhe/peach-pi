/** Heuristic detection of credential-looking pasted text, used to offer
 *  storing it in Bitwarden Secrets Manager instead of leaving it in chat.
 *  Deliberately conservative: only single-token, high-entropy or known-prefix
 *  strings trigger, so ordinary pasted text never nags the user. */

export interface DetectedSecret {
  value: string;
  /** A suggested, editable env-style name for the secret. */
  suggestedName: string;
  /** Provider/family token derived from the matched prefix, e.g. "OPENAI",
   *  "GITHUB". Used by the store prompt to surface related existing secrets
   *  (same provider) so the user can spot a likely duplicate before saving.
   *  Null for the generic high-entropy fallback (no known provider). */
  family: string | null;
}

/** Known provider prefixes → a sensible default secret name. */
const PREFIXES: { re: RegExp; name: string }[] = [
  { re: /^sk-proj-[A-Za-z0-9_-]{16,}$/, name: "OPENAI_API_KEY" },
  { re: /^sk-[A-Za-z0-9_-]{16,}$/, name: "OPENAI_API_KEY" },
  { re: /^sk-ant-[A-Za-z0-9_-]{16,}$/, name: "ANTHROPIC_API_KEY" },
  { re: /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/, name: "GITHUB_TOKEN" },
  { re: /^github_pat_[A-Za-z0-9_]{20,}$/, name: "GITHUB_TOKEN" },
  { re: /^glpat-[A-Za-z0-9_-]{20,}$/, name: "GITLAB_TOKEN" },
  { re: /^xox[baprs]-[A-Za-z0-9-]{10,}$/, name: "SLACK_TOKEN" },
  { re: /^AKIA[0-9A-Z]{16}$/, name: "AWS_ACCESS_KEY_ID" },
  { re: /^AIza[0-9A-Za-z_-]{30,}$/, name: "GOOGLE_API_KEY" },
  { re: /^sk_live_[A-Za-z0-9]{20,}$/, name: "STRIPE_SECRET_KEY" },
  { re: /^sk_test_[A-Za-z0-9]{20,}$/, name: "STRIPE_TEST_KEY" },
  { re: /^hf_[A-Za-z0-9]{20,}$/, name: "HUGGINGFACE_TOKEN" },
  { re: /^ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, name: "JWT_TOKEN" },
  { re: /^0\.[0-9a-f-]{30,}\.[A-Za-z0-9+/=:_-]{10,}$/, name: "BWS_ACCESS_TOKEN" },
];

export function detectSecret(text: string): DetectedSecret | null {
  const v = text.trim();
  if (!v || v.length < 16 || v.length > 500) return null;
  if (/\s/.test(v)) return null; // single token only
  if (/:\/\//.test(v) || v.startsWith("/") || v.startsWith("~") || v.startsWith(".")) return null; // url / path
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return null; // email

  for (const p of PREFIXES) if (p.re.test(v)) return { value: v, suggestedName: p.name, family: p.name.split("_")[0] ?? null };

  // Generic high-entropy fallback: long, mixed-case + digits, base64/hex charset.
  const generic =
    v.length >= 24 &&
    /[a-z]/.test(v) &&
    /[A-Z]/.test(v) &&
    /[0-9]/.test(v) &&
    /^[A-Za-z0-9._+/=-]+$/.test(v);
  if (generic) return { value: v, suggestedName: "API_KEY", family: null };

  return null;
}
