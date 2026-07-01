import { test } from "node:test";
import assert from "node:assert/strict";
import { AnthropicUsageProvider } from "../../electron/services/usage/providers/anthropic.ts";

function stubFetch(handler: (input: string, init?: any) => Response): typeof globalThis.fetch {
  return ((input: any, init?: any) => {
    const url = typeof input === "string" ? input : String(input);
    return Promise.resolve(handler(url, init));
  }) as any;
}

test("AnthropicUsageProvider.run: ok state with quota windows from oauth credential", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() =>
    new Response(
      JSON.stringify({
        five_hour: { utilization: 40, resets_at: "2026-07-01T00:00:00Z" },
        seven_day: { utilization: 10, resets_at: "2026-07-07T00:00:00Z" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "ok");
    const q = result.summary as { kind: "quota"; fiveHours: { remainingPct: number } | null; weekly: { remainingPct: number } | null };
    // utilization 40% consumed → 60% remaining.
    assert.equal(q.fiveHours?.remainingPct, 60);
    assert.equal(q.weekly?.remainingPct, 90);
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: partial when only one window present", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() =>
    new Response(JSON.stringify({ five_hour: { utilization: 55 } }), { status: 200 }),
  );
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "partial");
    const q = result.summary as { kind: "quota"; fiveHours: { remainingPct: number } | null; weekly: null };
    assert.equal(q.fiveHours?.remainingPct, 45);
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: 401 → unknown state with rejected-token note", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() => new Response("unauth", { status: 401 }));
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "unknown");
    assert.equal(result.note, "Anthropic token rejected — re-run pi login.");
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: HTTP error → unknown with failure note", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stubFetch(() => new Response("err", { status: 500 }));
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "unknown");
    assert.match(result.note ?? "", /^Fetch failed: HTTP 500/);
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: manual credential (not logged in) → unsupported with set-up note", async () => {
  const provider = new AnthropicUsageProvider();
  const result = await provider.run({ kind: "manual", note: "Run `pi login` …" });
  assert.equal(result.state, "unsupported");
  assert.equal(result.note, "Run `pi login` …");
});

test("AnthropicUsageProvider.run: sends User-Agent + anthropic-beta headers (official-client bucket)", async () => {
  const original = globalThis.fetch;
  let captured: Record<string, string> = {};
  globalThis.fetch = stubFetch((_url, init) => {
    captured = (init?.headers ?? {}) as Record<string, string>;
    return new Response(
      JSON.stringify({
        five_hour: { utilization: 0, resets_at: "2026-07-01T00:00:00Z" },
        seven_day: { utilization: 0, resets_at: "2026-07-07T00:00:00Z" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const provider = new AnthropicUsageProvider();
    await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.match(captured["User-Agent"] ?? "", /^claude-code\//);
    assert.equal(captured["anthropic-beta"], "oauth-2025-04-20");
    assert.match(captured["Authorization"] ?? "", /^Bearer tok$/);
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: transient 429 retried, then succeeds → ok state", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((() => {
    calls++;
    if (calls === 1) return Promise.resolve(new Response("rate limited", { status: 429 }));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          five_hour: { utilization: 25, resets_at: "2026-07-01T00:00:00Z" },
          seven_day: { utilization: 5, resets_at: "2026-07-07T00:00:00Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as any) as any;
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "ok");
    assert.equal(calls, 2);
    const q = result.summary as { kind: "quota"; fiveHours: { remainingPct: number } | null };
    assert.equal(q.fiveHours?.remainingPct, 75);
  } finally {
    globalThis.fetch = original;
  }
});

test("AnthropicUsageProvider.run: persistent 429 after retries → unknown with rate-limit note", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    return Promise.resolve(new Response("rate limited", { status: 429 }));
  }) as any;
  try {
    const provider = new AnthropicUsageProvider();
    const result = await provider.run({ kind: "oauth", accessToken: "tok" });
    assert.equal(result.state, "unknown");
    assert.match(result.note ?? "", /rate-limited/);
    // initial + MAX_429_RETRIES
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
