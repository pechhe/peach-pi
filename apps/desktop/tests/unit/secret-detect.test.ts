import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSecret } from "../../src/lib/secret-detect.ts";

test("detects an OpenAI key and tags its provider family", () => {
  const d = detectSecret("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789");
  assert.ok(d);
  assert.equal(d.suggestedName, "OPENAI_API_KEY");
  assert.equal(d.family, "OPENAI");
});

test("detects a GitHub token and tags its family", () => {
  const d = detectSecret("ghp_" + "a".repeat(38));
  assert.ok(d);
  assert.equal(d.family, "GITHUB");
});

test("generic high-entropy secret has no known family", () => {
  const d = detectSecret("Zx9vQ2mN8tRY4tRy7kPl1bC3="); // 24 chars mixed, base64 charset
  assert.ok(d);
  assert.equal(d.family, null);
  assert.equal(d.suggestedName, "API_KEY");
});

test("ignores ordinary text and urls", () => {
  assert.equal(detectSecret("hello room"), null);
  assert.equal(detectSecret("https://api.openai.com/v1/chat"), null);
  assert.equal(detectSecret("user@example.com"), null);
});
