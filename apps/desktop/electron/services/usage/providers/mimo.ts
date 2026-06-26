import type { FetchResult, UsageProvider, Credential } from "../usage-shared.ts";
import { NullCredentialSource } from "../usage-credentials.ts";

// ── Xiaomi MiMo Token Plan ──────────────────────────────────────────────
// MiMo's "Token Plan" is a subscription quota (like Z.ai's GLM Coding Plan),
// BUT the quota is NOT exposed via any API reachable with the `tp-` inference
// key. The inference gateway (token-plan-ams.xiaomimimo.com/v1) only serves
// OpenAI-compatible chat/models endpoints; the quota dashboard
// (platform.xiaomimimo.com/api/v1/*) requires an account.xiaomi.com browser
// session, not the key. So this provider can only confirm the plan is
// configured and point at the dashboard — it cannot show live usage.
// (A live-% path would need cookie/HAR scraping; intentionally not done.)

const DASHBOARD_URL = "https://platform.xiaomimimo.com/#/console/plan-manage";

const UNCONFIGURED_NOTE = "Add a MiMo Token Plan API key (tp-…) under the xiaomi provider to enable inference.";
const MANUAL_NOTE = "Token Plan quota isn't readable via the API key. View it on the dashboard:";

/** Dashboard-only provider. Composes a {@link NullCredentialSource} that yields
 *  the set-up or manual note depending on whether the key is configured.
 *  `run()` returns `state: "manual"` + the dashboard link. */
export class XiaomiMiMoProvider implements UsageProvider {
  readonly provider = "xiaomi";
  readonly label = "Xiaomi · MiMo Token Plan";
  readonly credential: NullCredentialSource;

  constructor(credential?: NullCredentialSource) {
    this.credential = credential ?? new NullCredentialSource("xiaomi", UNCONFIGURED_NOTE, MANUAL_NOTE);
  }

  async run(cred: Credential): Promise<FetchResult> {
    // Preserve the unsupported-vs-manual distinction the old adapter made:
    // an unconfigured provider surfaces `state: "unsupported"` (set-up note),
    // while a configured-but-dashboard-only provider surfaces `state: "manual"`.
    // The note already carried by the `manual` credential matches both cases.
    const configured = await this.credential.configured();
    if (!configured) {
      return { summary: null, state: "unsupported", note: cred.kind === "manual" ? cred.note : null };
    }
    return { summary: null, state: "manual", note: cred.kind === "manual" ? cred.note : null };
  }

  dashboardUrl(): string {
    return DASHBOARD_URL;
  }
}
