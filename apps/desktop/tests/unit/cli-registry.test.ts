import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_CLIS } from "../../electron/services/cli-registry.ts";

test("every CLI descriptor has a unique id", () => {
  const ids = KNOWN_CLIS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate descriptor id");
});

test("descriptors carry the metadata the renderer needs", () => {
  for (const c of KNOWN_CLIS) {
    assert.ok(c.id, "id");
    assert.ok(c.name, `${c.id} name`);
    assert.ok(c.versionArgs.length > 0, `${c.id} versionArgs`);
    assert.ok(c.authArgs.length > 0, `${c.id} authArgs`);
    assert.ok(c.loginCmd.startsWith(c.id), `${c.id} loginCmd should invoke its own binary`);
    assert.ok(c.installHint, `${c.id} installHint`);
    assert.match(c.docsUrl, /^https?:\/\//, `${c.id} docsUrl`);
  }
});

test("version regexes extract a semver from representative output", () => {
  const samples: Record<string, string> = {
    vercel: "Vercel CLI 39.2.1",
    gh: "gh version 2.45.0 (2024-03-04)",
    fly: "flyctl v0.2.72 darwin/arm64",
    supabase: "1.142.2",
    wrangler: " ⛅️ wrangler 3.48.0",
  };
  for (const c of KNOWN_CLIS) {
    const sample = samples[c.id];
    if (!sample) continue;
    const m = sample.match(c.versionRegex);
    assert.ok(m?.[1], `${c.id} versionRegex did not match "${sample}"`);
  }
});
