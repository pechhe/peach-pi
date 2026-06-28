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

/** Poll up to ~2s for `predicate` to return truthy. fs.watch on macOS
 *  FSEvents has variable latency, so a fixed sleep racy-fails the control
 *  channel test. */
async function waitFor<T>(predicate: () => T | undefined): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const v = predicate();
    if (v) return v;
    await sleep(20);
  }
  throw new Error("waitFor: timed out");
}

function readEvents(log: string): any[] {
  try {
    return readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

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
  const state = await waitFor(() =>
    readEvents(log).find((e) => e.event === "devtap.state"),
  );
  stopDevTapControlChannel();
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
