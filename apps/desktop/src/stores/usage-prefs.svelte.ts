import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/**
 * Per-provider "featured metric" preference: which metric key to surface in
 * the compact sidebar usage line. Render-side display preference only,
 * persisted to localStorage with the same convention as command-prefs. The
 * `storage` event keeps every window in sync.
 */

const KEY = "peachpi:usageHighlights";
const HIDDEN_KEY = "peachpi:usageHidden";

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, value: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function readArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function reload(store: UsagePrefsStore): void {
  store.highlights = readMap<string[]>(KEY);
  store.hidden = readArray(HIDDEN_KEY);
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
      if (e.key === KEY || e.key === HIDDEN_KEY || e.key === null) reload(this);
    });
  }

  keysFor(provider: string): string[] {
    return this.highlights[provider] ?? [];
  }

  /** Toggle a metric key on/off for `provider`, preserving order. */
  pin(provider: string, metricKey: string): void {
    const cur = this.highlights[provider] ?? [];
    const next = cur.includes(metricKey)
      ? cur.filter((k) => k !== metricKey)
      : [...cur, metricKey];
    this.highlights = { ...this.highlights, [provider]: next };
    writeMap(KEY, this.highlights);
  }

  /** Reset a provider to its default featured metric. */
  reset(provider: string): void {
    const next = { ...this.highlights };
    delete next[provider];
    this.highlights = next;
    writeMap(KEY, this.highlights);
  }

  isHidden(provider: string): boolean {
    return this.hidden.includes(provider);
  }

  /** Hide a provider from the sidebar line + popover. */
  toggleHidden(provider: string): void {
    this.hidden = this.hidden.includes(provider)
      ? this.hidden.filter((p) => p !== provider)
      : [...this.hidden, provider];
    writeArray(HIDDEN_KEY, this.hidden);
  }

  /** Reveal every hidden provider. */
  showAll(): void {
    this.hidden = [];
    writeArray(HIDDEN_KEY, this.hidden);
  }
}

export const usagePrefs = new UsagePrefsStore();

/** Provider lookup convenience for the sidebar / popover. */
export function byProvider(
  summaries: ProviderUsageSummary[],
  provider: string,
): ProviderUsageSummary | undefined {
  return summaries.find((s) => s.provider === provider);
}
