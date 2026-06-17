import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillInvocation } from "../../src/lib/composer/skill-message.ts";

const block = [
  '<skill name="diagnose" location="/skills/diagnose/SKILL.md">',
  "References are relative to /skills/diagnose.",
  "",
  "# Diagnose",
  "Reproduce then minimise.",
  "</skill>",
].join("\n");

test("parses a skill block into name, location, and body", () => {
  const parsed = parseSkillInvocation(block);
  assert.ok(parsed);
  assert.equal(parsed.name, "diagnose");
  assert.equal(parsed.location, "/skills/diagnose/SKILL.md");
  assert.equal(parsed.body, "# Diagnose\nReproduce then minimise.");
  assert.equal(parsed.args, "");
});

test("captures trailing user arguments after the block", () => {
  const parsed = parseSkillInvocation(`${block}\n\nfix the login bug`);
  assert.ok(parsed);
  assert.equal(parsed.args, "fix the login bug");
});

test("returns null for ordinary messages", () => {
  assert.equal(parseSkillInvocation("just a normal prompt"), null);
  assert.equal(parseSkillInvocation("/diagnose"), null);
});
