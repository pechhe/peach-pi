import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFiveHour,
  isWeekly,
  zaiWindow,
  extractZaiLimits,
  type ZaiLimit,
} from "../../electron/services/usage-adapters.ts";

test("isFiveHour: matches the numeric limit code (unit=3,number=5)", () => {
  assert.ok(isFiveHour({ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 41 }));
});

test("isFiveHour: matches the labelled form", () => {
  assert.ok(isFiveHour({ type: "Token usage(5 Hour)", percentage: 41 }));
});

test("isWeekly: matches the numeric limit code (unit=6,number=1)", () => {
  assert.ok(isWeekly({ type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 12 }));
});

test("isWeekly: matches the labelled form", () => {
  assert.ok(isWeekly({ type: "Token usage(Weekly)", percentage: 12 }));
});

test("isFiveHour/isWeekly reject unrelated window types", () => {
  const mcp: ZaiLimit = { type: "MCP usage(1 Month)", percentage: 3 };
  assert.equal(isFiveHour(mcp), false);
  assert.equal(isWeekly(mcp), false);
});

test("zaiWindow: normalizes percentage + reset timestamp", () => {
  const w = zaiWindow({ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 82.3, nextResetTime: 1719234567000 });
  assert.equal(w?.usedPct, 82.3);
  assert.equal(w?.resetAt, new Date(1719234567000).toISOString());
});

test("zaiWindow: null when percentage missing", () => {
  assert.equal(zaiWindow({ type: "TOKENS_LIMIT", unit: 3, number: 5 }), null);
  assert.equal(zaiWindow(undefined), null);
});

test("zaiWindow: treats missing reset time as null (not a throw)", () => {
  const w = zaiWindow({ type: "Token usage(Weekly)", percentage: 9 });
  assert.equal(w?.usedPct, 9);
  assert.equal(w?.resetAt, null);
});

test("zaiWindow: clamps percentage to 0-100", () => {
  assert.equal(zaiWindow({ type: "Token usage(5 Hour)", percentage: 150 })?.usedPct, 100);
  assert.equal(zaiWindow({ type: "Token usage(5 Hour)", percentage: -5 })?.usedPct, 0);
});

test("zaiWindow: rejects non-numeric percentage", () => {
  const bad = { type: "Token usage(5 Hour)", percentage: "82%" } as unknown as ZaiLimit;
  assert.equal(zaiWindow(bad), null);
});

test("extractZaiLimits: reads limits from the real {code,data:{limits}} envelope", () => {
  // Real shape captured from api.z.ai/api/monitor/usage/quota/limit.
  const body = {
    code: 200,
    msg: "Operation successful",
    data: {
      limits: [
        { type: "TIME_LIMIT", unit: 5, number: 1, percentage: 0, nextResetTime: 1784203358992 },
        { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 75, nextResetTime: 1782310087196 },
        { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 15, nextResetTime: 1782820958976 },
      ],
    },
  };
  const limits = extractZaiLimits(body);
  assert.equal(limits.length, 3);
  // The 5-hour + weekly windows must resolve from this envelope.
  assert.equal(zaiWindow(limits.find(isFiveHour))?.usedPct, 75);
  assert.equal(zaiWindow(limits.find(isWeekly))?.usedPct, 15);
});

test("extractZaiLimits: tolerates a bare {limits} shape", () => {
  const limits = extractZaiLimits({ limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 41 }] });
  assert.equal(limits.length, 1);
  assert.equal(zaiWindow(limits.find(isFiveHour))?.usedPct, 41);
});

test("extractZaiLimits: empty when the envelope is absent/malformed", () => {
  assert.deepEqual(extractZaiLimits(null), []);
  assert.deepEqual(extractZaiLimits({}), []);
  assert.deepEqual(extractZaiLimits({ data: {} }), []);
  assert.deepEqual(extractZaiLimits({ data: { limits: "not-an-array" } }), []);
});
