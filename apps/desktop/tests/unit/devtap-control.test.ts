import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setDevTapStateProvider,
  startDevTapControlChannel,
  stopDevTapControlChannel,
} from "../../electron/services/devtap-control.ts";
import { devTapRequestsDir } from "../../electron/services/devtap.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("control channel processes a state request when enabled", async () => {
  const dir = mkdtempSync(join(tmpdir(), "devtap-ctl-"));
  const log = join(dir, "devtap.jsonl");
  process.env.DEV_TAP = "1";
  process.env.DEVTAP_LOG = log;
  setDevTapStateProvider(() => ({ ok: true, n: 42 }));
  startDevTapControlChannel();
  const reqDir = devTapRequestsDir();
  mkdirSync(reqDir, { recursive: true });
  writeFileSync(join(reqDir, "abc.json"), JSON.stringify({ id: "abc", cmd: "state" }));
  await sleep(800);
  stopDevTapControlChannel();
  const events = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const state = events.find((e) => e.event === "devtap.state");
  assert.ok(state, "devtap.state event emitted");
  assert.equal(state.payload.requestId, "abc");
  assert.deepEqual(state.payload.state, { ok: true, n: 42 });
});

test("control channel is a no-op when disabled", () => {
  const dir = mkdtempSync(join(tmpdir(), "devtap-off-"));
  process.env.DEVTAP_LOG = join(dir, "devtap.jsonl");
  delete process.env.DEV_TAP;
  startDevTapControlChannel();
  assert.equal(existsSync(join(dir, "devtap", "requests")), false);
});
