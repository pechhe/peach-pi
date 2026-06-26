import { test } from "node:test";
import assert from "node:assert/strict";
import { NeuralWattUsageProvider } from "../../electron/services/usage/providers/neuralwatt.ts";

function stubFetch(handler: (input: string) => Response): typeof globalThis.fetch {
  return ((input: any) => {
    const url = typeof input === "string" ? input : String(input);
    return Promise.resolve(handler(url));
  }) as any;
}

test("NeuralWattUsageProvider.run: ok state with balance + month metrics", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch((url) => {
    if (url.endsWith("/quota")) {
      return new Response(
        JSON.stringify({
          balance: { credits_remaining_usd: 4.5, total_credits_usd: 10 },
          usage: { current_month: { cost_usd: 1.2, requests: 1530, tokens: 99, energy_kwh: 0.0234 } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // /usage/energy — today's UTC date row.
    const today = new Date().toISOString().slice(0, 10);
    return new Response(
      JSON.stringify({ daily: [{ date: today, energy_kwh: 0.01 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const provider = new NeuralWattUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "nw-key" });
    assert.equal(result.state, "ok");
    const b = result.summary as { kind: "balance"; balanceUSD: number | null; spentDay: number | null; spentMonth: number | null; extra: { label: string; value: string }[] };
    assert.equal(b.balanceUSD, 4.5);
    assert.equal(b.spentMonth, 1.2);
    // today's energy 0.01 kWh × $5/kWh = $0.05
    assert.ok(b.spentDay !== null && Math.abs(b.spentDay - 0.05) < 1e-9);
    const labels = b.extra.map((e) => e.label);
    assert.ok(labels.includes("Energy (this month)"));
    assert.ok(labels.includes("Requests (this month)"));
    assert.ok(labels.includes("Total credits"));
  } finally {
    globalThis.fetch = original;
  }
});

test("NeuralWattUsageProvider.run: ok when /usage/energy fails (balance + month still surface)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch((url) => {
    if (url.endsWith("/quota")) {
      return new Response(
        JSON.stringify({ balance: { credits_remaining_usd: 4.5 }, usage: { current_month: { cost_usd: 1.2 } } }),
        { status: 200 },
      );
    }
    return new Response("err", { status: 500 });
  });
  try {
    const provider = new NeuralWattUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "ok");
    const b = result.summary as { kind: "balance"; balanceUSD: number | null; spentDay: number | null; spentMonth: number | null };
    assert.equal(b.balanceUSD, 4.5);
    assert.equal(b.spentMonth, 1.2);
    assert.equal(b.spentDay, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("NeuralWattUsageProvider.run: unknown on quota HTTP error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() => new Response("err", { status: 503 }));
  try {
    const provider = new NeuralWattUsageProvider();
    const result = await provider.run({ kind: "api-key", value: "k" });
    assert.equal(result.state, "unknown");
    assert.equal(result.summary, null);
    assert.match(result.note ?? "", /^Fetch failed: HTTP 503/);
  } finally {
    globalThis.fetch = original;
  }
});

test("NeuralWattUsageProvider.run: ignores non-api-key credentials", async () => {
  const provider = new NeuralWattUsageProvider();
  const result = await provider.run({ kind: "manual", note: "n/a" });
  assert.equal(result.state, "unknown");
});
