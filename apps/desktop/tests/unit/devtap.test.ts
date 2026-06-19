import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitDevTapEvent, sanitizePayload } from "../../electron/services/devtap.ts";

function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), "devtap-")), "devtap.jsonl");
}

test("emit writes valid JSONL when enabled", () => {
  const log = tempLog();
  process.env.DEV_TAP = "1";
  process.env.DEVTAP_LOG = log;
  emitDevTapEvent({ area: "lifecycle", event: "test.one", message: "hi" });
  emitDevTapEvent({ level: "warn", area: "ipc", event: "test.two", payload: { a: 1 } });
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]!);
  assert.equal(first.event, "test.one");
  assert.equal(first.level, "info");
  assert.match(first.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.parse(lines[1]!).payload.a, 1);
});

test("disabled DevTap writes nothing", () => {
  const log = tempLog();
  delete process.env.DEV_TAP;
  process.env.DEVTAP_LOG = log;
  emitDevTapEvent({ event: "test.disabled" });
  assert.equal(existsSync(log), false);
});

test("sanitizer redacts obvious secrets", () => {
  const out = sanitizePayload({
    password: "hunter2",
    token: "abc",
    apiKey: "k",
    authorization: "Bearer x",
    cookie: "c",
    nested: { secret: "s", keep: "ok" },
    keep: 1,
  }) as Record<string, unknown>;
  assert.equal(out.password, "[redacted]");
  assert.equal(out.token, "[redacted]");
  assert.equal(out.apiKey, "[redacted]");
  assert.equal(out.authorization, "[redacted]");
  assert.equal(out.cookie, "[redacted]");
  assert.equal((out.nested as Record<string, unknown>).secret, "[redacted]");
  assert.equal((out.nested as Record<string, unknown>).keep, "ok");
  assert.equal(out.keep, 1);
});

test("malformed JSONL does not crash the reader", () => {
  const log = tempLog();
  writeFileSync(log, '{"ts":"x","level":"info","event":"ok"}\nNOT JSON\n{bad}\n');
  const script = join(import.meta.dirname, "..", "..", "..", "..", "scripts", "devtap.mjs");
  const out = execFileSync("node", [script, "status"], {
    env: { ...process.env, DEVTAP_LOG: log },
    encoding: "utf8",
  });
  assert.match(out, /Malformed lines: 2/);
  assert.match(out, /Events: 1/);
});
