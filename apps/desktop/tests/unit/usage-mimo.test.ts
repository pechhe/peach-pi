import { test } from "node:test";
import assert from "node:assert/strict";
import { XiaomiMiMoProvider } from "../../electron/services/usage/providers/mimo.ts";

function fakeNullSource(configured: boolean, note: string) {
  return {
    provider: "xiaomi",
    kind: "manual" as const,
    configured: async () => configured,
    resolve: async () => ({ kind: "manual" as const, note }) as const,
  };
}

test("XiaomiMiMoProvider.run: configured → manual state with manual note", async () => {
  const provider = new XiaomiMiMoProvider(fakeNullSource(true, "Token Plan quota isn't readable via the API key. View it on the dashboard:") as any);
  const result = await provider.run({ kind: "manual", note: "Token Plan quota isn't readable via the API key. View it on the dashboard:" });
  assert.equal(result.state, "manual");
  assert.equal(result.summary, null);
  assert.match(result.note ?? "", /Token Plan quota isn't readable/);
  assert.equal(provider.dashboardUrl(), "https://platform.xiaomimimo.com/#/console/plan-manage");
});

test("XiaomiMiMoProvider.run: unconfigured → unsupported state with set-up note", async () => {
  const provider = new XiaomiMiMoProvider(fakeNullSource(false, "Add a MiMo Token Plan API key (tp-…) under the xiaomi provider to enable inference.") as any);
  const result = await provider.run({ kind: "manual", note: "Add a MiMo Token Plan API key (tp-…) under the xiaomi provider to enable inference." });
  assert.equal(result.state, "unsupported");
  assert.equal(result.summary, null);
  assert.match(result.note ?? "", /Add a MiMo Token Plan API key/);
});
