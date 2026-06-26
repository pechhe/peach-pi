import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSecretsHint, parseSecretsHint } from "../../src/lib/composer/hints.ts";

// Producer (buildSecretsHint) and transcript parser (parseSecretsHint) share a
// plain-text format. Keep them coupled so the transcript renders secret badges
// when the hint wording changes.
test("parses the hint produced by buildSecretsHint and strips the body", () => {
  const hint = buildSecretsHint([
    { id: "abc-123", name: "OPENAI_API_KEY", projectId: "proj-1" },
    { id: "def-456", name: "STRIPE_SECRET_KEY", projectId: "proj-1" },
  ]);
  const body = "deploy the checkout service to staging";
  const parsed = parseSecretsHint(`${hint}\n\n${body}`);

  assert.ok(parsed, "hint should parse");
  assert.deepEqual(parsed.secrets, [
    { name: "OPENAI_API_KEY", id: "abc-123" },
    { name: "STRIPE_SECRET_KEY", id: "def-456" },
  ]);
  assert.equal(parsed.body, body);
});

test("returns null for an ordinary message with no hint", () => {
  assert.equal(parseSecretsHint("just a normal message"), null);
});

test("handles a pinned secret with no typed body", () => {
  const hint = buildSecretsHint([
    { id: "abc-123", name: "ANTHROPIC_API_KEY", projectId: "proj-1" },
  ]);
  const parsed = parseSecretsHint(hint);
  assert.ok(parsed);
  assert.deepEqual(parsed.secrets, [{ name: "ANTHROPIC_API_KEY", id: "abc-123" }]);
  assert.equal(parsed.body, "");
});

test("the hint never contains the secret value", () => {
  // buildSecretsHint inputs ReferencedSecret (id+name+projectId only) — the
  // function must never have access to the cleartext value. Assert the wording
  // reminds the model to fetch via the tool rather than expect it inline.
  const hint = buildSecretsHint([
    { id: "x", name: "AWS_ACCESS_KEY_ID", projectId: "p" },
  ]);
  assert.match(hint, /bws_get_secret/);
  assert.match(hint, /NOT in this prompt/);
  assert.doesNotMatch(hint, /AKIA/); // value never plumbed in
});
