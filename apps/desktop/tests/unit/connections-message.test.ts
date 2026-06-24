import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConnectionsHint } from "../../src/lib/composer/mode.ts";
import { parseConnectionsHint } from "../../src/lib/composer/connections-message.ts";

// The producer (buildConnectionsHint) and the transcript parser
// (parseConnectionsHint) share a plain-text format. This test couples them so
// the transcript keeps rendering badges if the hint wording ever changes.
test("parses the hint produced by buildConnectionsHint and strips the body", () => {
  const hint = buildConnectionsHint([
    { kind: "custom", name: "Leadmagic", baseUrl: "https://api.leadmagic.io" },
    { kind: "composio", name: "Gmail", toolkitSlug: "gmail" },
  ]);
  const body = "can you find phone numbers for people at westminster waste";
  const parsed = parseConnectionsHint(`${hint}\n\n${body}`);

  assert.ok(parsed, "hint should parse");
  assert.deepEqual(parsed.connections, [
    { kind: "custom", name: "Leadmagic" },
    { kind: "composio", name: "Gmail" },
  ]);
  assert.equal(parsed.body, body);
});

test("returns null for an ordinary message with no hint", () => {
  assert.equal(parseConnectionsHint("just a normal message"), null);
});

test("handles a pinned connection with no typed body", () => {
  const hint = buildConnectionsHint([
    { kind: "custom", name: "Metabase", baseUrl: "https://mb.acme.com" },
  ]);
  const parsed = parseConnectionsHint(hint);
  assert.ok(parsed);
  assert.deepEqual(parsed.connections, [{ kind: "custom", name: "Metabase" }]);
  assert.equal(parsed.body, "");
});
