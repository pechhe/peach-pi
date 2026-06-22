/** Pull the `name:` field from skill.md frontmatter for filename. Lenient. */
export function extractNameFromFrontmatter(body: string): string | null {
  const m = body.match(/^name:\s*(\S+)/m);
  return m?.[1] ?? null;
}
