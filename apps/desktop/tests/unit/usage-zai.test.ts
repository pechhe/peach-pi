import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZaiUsageProvider,
  isFiveHour,
  isWeekly,
  zaiWindow,
  extractZaiLimits,
  type ZaiLimit,
} from "../../electron/services/usage/providers/zai.ts";

// ── pure-shape helpers (unchanged from prior tests) ─────────────────────

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
  // `percentage` is consumed %; remaining counts down (100 - used).
  assert.ok(w && Math.abs(w.remainingPct - 17.7) < 0.01);
  assert.equal(w?.resetAt, new Date(1719234567000).toISOString());
});

test("zaiWindow: null when percentage missing", () => {
  assert.equal(zaiWindow({ type: "TOKENS_LIMIT", unit: 3, number: 5 }), null);
  assert.equal(zaiWindow(undefined), null);
});

test("zaiWindow: treats missing reset time as null (not a throw)", () => {
  const w = zaiWindow({ type: "Token usage(Weekly)", percentage: 9 });
  assert.equal(w?.remainingPct, 91);
  assert.equal(w?.resetAt, null);
});

test("zaiWindow: clamps percentage to 0-100", () => {
  // 150 used clamps to 100 → 0 remaining; -5 used clamps to 0 → 100 remaining.
  assert.equal(zaiWindow({ type: "Token usage(5 Hour)", percentage: 150 })?.remainingPct, 0);
  assert.equal(zaiWindow({ type: "Token usage(5 Hour)", percentage: -5 })?.remainingPct, 100);
});

test("zaiWindow: rejects non-numeric percentage", () => {
  const bad = { type: "Token usage(5 Hour)", percentage: "82%" } as unknown as ZaiLimit;
  assert.equal(zaiWindow(bad), null);
});

test("extractZaiLimits: reads limits from the real {code,data:{limits}} envelope", () => {
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
  assert.equal(zaiWindow(limits.find(isFiveHour))?.remainingPct, 25);
  assert.equal(zaiWindow(limits.find(isWeekly))?.remainingPct, 85);
});

test("extractZaiLimits: tolerates a bare {limits} shape", () => {
  const limits = extractZaiLimits({ limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 41 }] });
  assert.equal(limits.length, 1);
  assert.equal(zaiWindow(limits.find(isFiveHour))?.remainingPct, 59);
});

test("extractZaiLimits: empty when the envelope is absent/malformed", () => {
  assert.deepEqual(extractZaiLimits(null), []);
  assert.deepEqual(extractZaiLimits({}), []);
  assert.deepEqual(extractZaiLimits({ data: {} }), []);
  assert.deepEqual(extractZaiLimits({ data: { limits: "not-an-array" } }), []);
});

// ── run() with a fake CredentialSource (no models.json / no network) ────

function fakeApiKeySource(value: string | undefined, configured: boolean) {
  const cred = { kind: "api-key" as const, value: value ?? "", baseUrl: undefined };
  return {
    provider: "zai",
    kind: "api-key" as const,
    configured: async () => configured,
    resolve: async () => cred,
  };
}

test("ZaiUsageProvider.run: shapes a quota response using the resolved api-key credential", async () => {
  // Stub the module-level fetch so no real network leaves the process.
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: any, init: any) => {
    calls.push(typeof input === "string" ? input : String(input));
    // Mirror the documented {code,data:{limits}} envelope.
    const body = {
      code: 200,
      data: {
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 75, nextResetTime: 1782310087196 },
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 15, nextResetTime: 1782820958976 },
        ],
      },
    };
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    ) as any;
    void init;
  }) as any;

  try {
    const provider = new ZaiUsageProvider(fakeApiKeySource("fake-zai-key", true) as any);
    const result = await provider.run({ kind: "api-key", value: "fake-zai-key" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "https://api.z.ai/api/monitor/usage/quota/limit");
    assert.equal(result.state, "ok");
    assert.equal(result.summary?.kind, "quota");
    const q = result.summary as { kind: "quota"; fiveHours: { remainingPct: number } | null; weekly: { remainingPct: number } | null };
    assert.equal(q.fiveHours?.remainingPct, 25);
    assert.equal(q.weekly?.remainingPct, 85);
  } finally {
    globalThis.fetch = original;
  }
});

test("ZaiUsageProvider.run: unknown state when no windows resolve", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ code: 200, data: { limits: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )) as any;
  try {
    const provider = new ZaiUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "unknown");
    assert.equal(result.summary, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("ZaiUsageProvider.run: surfaces a fetch failure note on HTTP error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("upstream error", { status: 500 }))) as any;
  try {
    const provider = new ZaiUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "unknown");
    assert.equal(result.summary, null);
    assert.match(result.note ?? "", /^Fetch failed: HTTP 500/);
  } finally {
    globalThis.fetch = original;
  }
});

test("ZaiUsageProvider.run: ignores non-api-key credentials", async () => {
  const provider = new ZaiUsageProvider();
  const result = await provider.run({ kind: "manual", note: "n/a" });
  assert.equal(result.state, "unknown");
  assert.equal(result.summary, null);
});
