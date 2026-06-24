import type { FetchResult, UsageAdapter } from "./usage-shared.ts";
import { hasApiKey } from "./usage-adapters.ts";

// ── Xiaomi MiMo Token Plan ──────────────────────────────────────────────
// MiMo's "Token Plan" is a subscription quota (like Z.ai's GLM Coding Plan),
// BUT the quota is NOT exposed via any API reachable with the `tp-` inference
// key. The inference gateway (token-plan-ams.xiaomimimo.com/v1) only serves
// OpenAI-compatible chat/models endpoints; the quota dashboard
// (platform.xiaomimimo.com/api/v1/*) requires an account.xiaomi.com browser
// session, not the key. So this adapter can only confirm the plan is
// configured and point at the dashboard — it cannot show live usage.
// (A live-% path would need cookie/HAR scraping; intentionally not done.)

const PROVIDER_ID = "xiaomi";
const DASHBOARD_URL = "https://platform.xiaomimimo.com/#/console/plan-manage";

export class XiaomiMiMoAdapter implements UsageAdapter {
  label = "Xiaomi · MiMo Token Plan";
  async configured(): Promise<boolean> {
    return hasApiKey(PROVIDER_ID);
  }
  async fetch(): Promise<FetchResult> {
    if (!(await this.configured())) {
      return {
        summary: null,
        state: "unsupported",
        note: "Add a MiMo Token Plan API key (tp-…) under the xiaomi provider to enable inference.",
      };
    }
    return {
      summary: null,
      state: "manual",
      note: "Token Plan quota isn't readable via the API key. View it on the dashboard:",
    };
  }
  dashboardUrl(): string {
    return DASHBOARD_URL;
  }
}
