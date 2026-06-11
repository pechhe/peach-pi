import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNextFire, isDue, isValidCron } from "../src/index.ts";

test("computeNextFire returns the next slot after the given time", () => {
  const next = computeNextFire("0 9 * * *", new Date("2026-06-11T10:00:00Z"));
  assert.ok(next);
  const d = new Date(next!);
  assert.equal(d.getHours(), 9); // local-time cron
  assert.ok(d.getTime() > new Date("2026-06-11T10:00:00Z").getTime());
});

test("computeNextFire is strictly after `after`", () => {
  const at = new Date("2026-06-11T09:00:00");
  const next = computeNextFire("0 9 * * *", at);
  assert.ok(new Date(next!).getTime() > at.getTime());
});

test("invalid cron yields null / false", () => {
  assert.equal(computeNextFire("not a cron", new Date()), null);
  assert.equal(isValidCron("not a cron"), false);
  assert.equal(isValidCron("*/5 * * * *"), true);
});

test("isDue compares persisted nextFireAt against now", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  assert.equal(isDue("2026-06-11T11:59:00Z", now), true);
  assert.equal(isDue("2026-06-11T12:00:00Z", now), true);
  assert.equal(isDue("2026-06-11T12:01:00Z", now), false);
  assert.equal(isDue(null, now), false);
});
