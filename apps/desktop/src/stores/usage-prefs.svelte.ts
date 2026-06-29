import { arrayPref, mapPref } from "../lib/local-prefs";
import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/**
 * Per-provider "featured metric" preference: which metric key to surface in
 * the compact sidebar usage line. Render-side display preference only,
 * persisted to localStorage with the same convention as command-prefs. The
 * `storage` event keeps every window in sync.
 */

const HIGHLIGHTS_KEY = "peachpi:usageHighlights";
const HIDDEN_KEY = "peachpi:usageHidden";
const highlightsPref = mapPref(HIGHLIGHTS_KEY);
const hiddenPref = arrayPref(HIDDEN_KEY);

function reload(store: UsagePrefsStore): void {
  store.highlights = highlightsPref.read<string[]>();
  store.hidden = hiddenPref.read();
}

class UsagePrefsStore {
  /** provider → list of chosen metric keys (pinned to sidebar line). */
  highlights = $state<Record<string, string[]>>({});
  /** Providers hidden from the sidebar line + popover. */
  hidden = $state<string[]>([]);
  private initialized = false;

  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    reload(this);
    window.addEventListener("storage", (e) => {
      if (e.key === HIGHLIGHTS_KEY || e.key === HIDDEN_KEY || e.key === null) reload(this);
    });
  }

  /** Pinned keys for a provider. `undefined` = never touched (use default
   *  first metric); `[]` = explicitly unpinned (show nothing in sidebar). */
  keysFor(provider: string): string[] | undefined {
    return this.highlights[provider];
  }

  /** Toggle a metric key on/off for `provider`, preserving order. */
  pin(provider: string, metricKey: string): void {
    const cur = this.highlights[provider] ?? [];
    const next = cur.includes(metricKey)
      ? cur.filter((k) => k !== metricKey)
      : [...cur, metricKey];
    this.highlights = { ...this.highlights, [provider]: next };
    highlightsPref.write(this.highlights);
  }

  /** Reset a provider to its default featured metric (clear any pins). */
  reset(provider: string): void {
    const next = { ...this.highlights };
    delete next[provider];
    this.highlights = next;
    highlightsPref.write(this.highlights);
  }

  /** Explicitly show nothing for `provider` in the sidebar line, while keeping
   *  it visible in the popover (unpin all, vs `toggleHidden`). */
  unpinAll(provider: string): void {
    this.highlights = { ...this.highlights, [provider]: [] };
    highlightsPref.write(this.highlights);
  }

  isHidden(provider: string): boolean {
    return this.hidden.includes(provider);
  }

  /** Hide a provider from the sidebar line + popover. */
  toggleHidden(provider: string): void {
    this.hidden = this.hidden.includes(provider)
      ? this.hidden.filter((p) => p !== provider)
      : [...this.hidden, provider];
    hiddenPref.write(this.hidden);
  }

  /** Reveal every hidden provider. */
  showAll(): void {
    this.hidden = [];
    hiddenPref.write([]);
  }
}

export const usagePrefs = new UsagePrefsStore();

/** Provider lookup convenience for the sidebar / popover. */
function byProvider(
  summaries: ProviderUsageSummary[],
  provider: string,
): ProviderUsageSummary | undefined {
  return summaries.find((s) => s.provider === provider);
}
