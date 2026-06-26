import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterUsageProvider } from "../../electron/services/usage/providers/openrouter.ts";

function stubFetch(handler: (input: string) => Response): typeof globalThis.fetch {
  return ((input: any) => {
    const url = typeof input === "string" ? input : String(input);
    return Promise.resolve(handler(url));
  }) as any;
}

test("OpenRouterUsageProvider.run: ok state with balance + spend metrics", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch((url) => {
    if (url.endsWith("/credits")) {
      return new Response(
        JSON.stringify({ data: { total_credits: 10, total_usage: 3.5 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // /key
    return new Response(
      JSON.stringify({ data: { usage_daily: 0.5, usage_weekly: 1.2, usage_monthly: 2.0 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const provider = new OpenRouterUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "or-key" });
    assert.equal(result.state, "ok");
    assert.equal(result.summary?.kind, "balance");
    const b = result.summary as { kind: "balance"; balanceUSD: number | null; spentDay: number | null; spentWeek: number | null; spentMonth: number | null; extra: { label: string; value: string }[] };
    assert.equal(b.balanceUSD, 10);
    assert.equal(b.spentDay, 0.5);
    assert.equal(b.spentWeek, 1.2);
    assert.equal(b.spentMonth, 2.0);
    assert.deepEqual(b.extra, [{ label: "Total used (all time)", value: "$3.50" }]);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenRouterUsageProvider.run: partial when /key fails but /credits ok", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch((url) => {
    if (url.endsWith("/credits")) {
      return new Response(JSON.stringify({ data: { total_credits: 5 } }), { status: 200 });
    }
    return new Response("nope", { status: 500 });
  });
  try {
    const provider = new OpenRouterUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "partial");
    const b = result.summary as { kind: "balance"; balanceUSD: number | null; spentDay: number | null; spentMonth: number | null };
    assert.equal(b.balanceUSD, 5);
    assert.equal(b.spentDay, null);
    assert.equal(b.spentMonth, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenRouterUsageProvider.run: unknown when /credits has no balance", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() => new Response(JSON.stringify({ data: {} }), { status: 200 }));
  try {
    const provider = new OpenRouterUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "unknown");
    assert.equal(result.summary, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenRouterUsageProvider.run: surfaces failure note on HTTP error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() => new Response("err", { status: 401 }));
  try {
    const provider = new OpenRouterUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "unknown");
    assert.match(result.note ?? "", /^Fetch failed: HTTP 401/);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenRouterUsageProvider.run: ignores non-api-key credentials", async () => {
  const provider = new OpenRouterUsageProvider();
  const result = await provider.run({ kind: "manual", note: "n/a" });
  assert.equal(result.state, "unknown");
});
