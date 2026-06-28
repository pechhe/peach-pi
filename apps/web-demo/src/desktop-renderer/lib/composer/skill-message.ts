/**
 * The pi SDK expands a `/skill:name` invocation into a `<skill>` block before
 * recording it as the user message (see agent-session `_expandSkillCommand`):
 *
 *   <skill name="NAME" location="PATH">
 *   References are relative to BASEDIR.
 *
 *   BODY
 *   </skill>
 *
 * with any user-typed arguments appended after a blank line. We detect that
 * shape so the transcript can show a compact chip instead of the whole skill.
 */
export interface ParsedSkillInvocation {
  name: string;
  location: string;
  /** Skill instructions (the inner block, with the "References…" line stripped). */
  body: string;
  /** Trailing user-typed text after the skill block, if any. */
  args: string;
}

const SKILL_RE = /^<skill name="([^"]*)" location="([^"]*)">\n([\s\S]*?)\n<\/skill>/;

export function parseSkillInvocation(text: string): ParsedSkillInvocation | null {
  const m = SKILL_RE.exec(text);
  if (!m) return null;
  const [matched, name, location, inner] = m;
  let body = (inner ?? "").trim();
  const ref = /^References are relative to [^\n]*\n+/.exec(body);
  if (ref) body = body.slice(ref[0].length);
  return {
    name: name ?? "",
    location: location ?? "",
    body,
    args: text.slice(matched.length).trim(),
  };
}
