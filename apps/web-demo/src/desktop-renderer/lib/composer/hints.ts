import type { ReferencedSecret } from "@peach-pi/shared-types";

/**
 * Producer/parser pair for the @-pinned BWS secrets hint format.
 *
 * The same plain-text hint block is built before a prompt is sent
 * (`buildSecretsHint`) and parsed back out of a stored message before it is
 * rendered (`parseSecretsHint`). Keeping build + parse in one module
 * guarantees the wording stays in lockstep — see secrets-message.test.ts.
 */

/** Build a prompt hint for @-pinned BWS secrets. Inputs only names + ids — never
 *  values — so the model knows what's available without the value ever entering
 *  the prompt text. The model fetches the value at runtime via bws_get_secret. */
export function buildSecretsHint(secrets: ReferencedSecret[]): string {
  if (secrets.length === 0) return "";
  const items = secrets.map((s) => `- secret "${s.name}" (id: ${s.id})`);
  return [
    "The user has pinned these Bitwarden Secrets Manager secrets for this task.",
    "To use one, call the bws_get_secret tool with its id; the value is returned as a tool result and is NOT in this prompt.",
    "Do not echo the secret value back to the user unless they explicitly ask.",
    ...items,
  ].join("\n");
}

/** Counterpart to buildSecretsHint: strips the pinned-secrets hint block so the
 *  transcript renders compact badges instead of the full hint. */
export interface ParsedSecretsHint {
  secrets: { name: string; id: string }[];
  /** The message body after the hint block (what the user actually typed). */
  body: string;
}

const S_HINT_RE =
  /^The user has pinned these Bitwarden Secrets Manager secrets for this task\.\nTo use one, call the bws_get_secret tool with its id; the value is returned as a tool result and is NOT in this prompt\.\nDo not echo the secret value back to the user unless they explicitly ask\.\n((?:- [^\n]*(?:\n|$))+)\n*/;
const S_ITEM_RE = /^- secret "([^"]+)" \(id: ([^)]+)\)/gm;

export function parseSecretsHint(text: string): ParsedSecretsHint | null {
  const m = S_HINT_RE.exec(text);
  if (!m) return null;
  const bullets = m[1] ?? "";
  const secrets: ParsedSecretsHint["secrets"] = [];
  for (const item of bullets.matchAll(S_ITEM_RE)) {
    secrets.push({ name: item[1] ?? "", id: item[2] ?? "" });
  }
  if (secrets.length === 0) return null;
  return { secrets, body: text.slice(m[0].length) };
}
