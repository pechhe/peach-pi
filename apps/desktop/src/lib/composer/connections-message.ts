/**
 * `@`-pinned connections are prepended to the outgoing user prompt as a plain
 * hint block (see buildConnectionsHint in mode.ts):
 *
 *   The user has pinned these connections for this task. Use them preferentially:
 *   - custom connection "Leadmagic" (base URL: https://api.leadmagic.io)
 *
 *   <the actual message body>
 *
 * The model needs that text, but the transcript should show compact badges
 * instead. We detect the leading block, pull out the connection names, and
 * return the remaining body so the bubble renders only what the user typed.
 */
export interface ParsedConnectionsHint {
  connections: { kind: "custom" | "composio"; name: string }[];
  /** The message body after the hint block (what the user actually typed). */
  body: string;
}

// The hint block is always prepended, so it anchors at the start: the fixed
// prefix line followed by one or more "- …" bullet lines, then the body.
const HINT_RE =
  /^The user has pinned these connections for this task\. Use them preferentially:\n((?:- [^\n]*(?:\n|$))+)\n*/;
const ITEM_RE = /^- (custom connection|composio toolkit) "([^"]+)"/gm;

export function parseConnectionsHint(text: string): ParsedConnectionsHint | null {
  const m = HINT_RE.exec(text);
  if (!m) return null;
  const bullets = m[1] ?? "";
  const connections: ParsedConnectionsHint["connections"] = [];
  for (const item of bullets.matchAll(ITEM_RE)) {
    connections.push({
      kind: item[1] === "custom connection" ? "custom" : "composio",
      name: item[2] ?? "",
    });
  }
  if (connections.length === 0) return null;
  return { connections, body: text.slice(m[0].length) };
}

/** Counterpart to buildSecretsHint (mode.ts): strips the pinned-secrets hint
 *  block so the transcript renders compact badges instead of the full hint. */
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
