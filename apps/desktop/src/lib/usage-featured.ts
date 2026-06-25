import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/**
 * Featured-metric selection. Each provider exposes a small set of metrics
 * (quota windows for subscriptions, balance/spend for pay-per-token). The
 * user pins ONE per provider as the value surfaced in the compact sidebar
 * line; the full list is shown in the hover popover where a pin can change.
 *
 * Pure functions shared by the sidebar line and the popover.
 */

/** Short 2-letter tag for compact sidebar display. */
const SHORT_TAG: Record<string, string> = {
  anthropic: "An",
  zai: "Za",
  xiaomi: "Mi",
  openrouter: "OR",
  neuralwatt: "NW",
};

export function shortTag(provider: string): string {
  return SHORT_TAG[provider] ?? provider.slice(0, 2);
}

function fmtMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

/** Urgency from a *remaining* percentage: 0% left → 1 (max red), 100% left → 0. */
function quotaUrgency(remainingPct: number): number {
  return Math.max(0, Math.min(1, (100 - remainingPct) / 100));
}

/** A selectable metric for one provider. */
export interface MetricOption {
  /** Stable key persisted as the chosen featured metric (e.g. "5h"). */
  key: string;
  /** Short label shown in the popover (e.g. "5-hour window"). */
  label: string;
  /** Compact label for the chip (e.g. "5h", "rem", "mo"). */
  short: string;
  /** Pre-formatted value (e.g. "67%", "$45.17"). */
  value: string;
  /** 0–1 urgency for coloring (red ≥ 0.9, amber ≥ 0.7, muted otherwise). */
  urgency: number;
}

/** All metrics available to feature for `s`, in default-priority order. */
export function metricOptions(s: ProviderUsageSummary): MetricOption[] {
  if (!s.configured || !s.summary) return [];
  const sum = s.summary;
  if (sum.kind === "quota") {
    const opts: MetricOption[] = [];
    if (sum.fiveHours) {
      const p = sum.fiveHours.remainingPct;
      opts.push({ key: "5h", label: "5-hour window", short: "5h", value: `${Math.round(p)}%`, urgency: quotaUrgency(p) });
    }
    if (sum.weekly) {
      const p = sum.weekly.remainingPct;
      opts.push({ key: "weekly", label: "Weekly window", short: "wk", value: `${Math.round(p)}%`, urgency: quotaUrgency(p) });
    }
    return opts;
  }
  // balance
  const opts: MetricOption[] = [];
  if (sum.balanceUSD !== null) {
    opts.push({
      key: "remaining",
      label: "Remaining",
      short: "rem",
      value: fmtMoney(sum.balanceUSD),
      urgency: balanceUrgency(sum.balanceUSD),
    });
  }
  if (sum.spentMonth !== null) {
    opts.push({ key: "month", label: "This month", short: "mo", value: fmtMoney(sum.spentMonth), urgency: 0.3 });
  }
  if (sum.spentWeek !== null) {
    opts.push({ key: "week", label: "This week", short: "wk", value: fmtMoney(sum.spentWeek), urgency: 0.3 });
  }
  if (sum.spentDay !== null) {
    opts.push({ key: "day", label: "Today", short: "day", value: fmtMoney(sum.spentDay), urgency: 0.3 });
  }
  return opts;
}

/** Lower balance = more urgent (closer to running out). */
function balanceUrgency(remaining: number): number {
  if (remaining < 5) return 1;
  if (remaining < 20) return 0.75;
  if (remaining < 50) return 0.45;
  return 0.2;
}

/** The featured metrics for `s`, honouring pinned `keys`.
 *  `undefined` = never touched → show default (first option).
 *  `[]` = explicitly unpinned → show nothing.
 *  otherwise the matched options, in option order. */
export function featuredMetrics(
  s: ProviderUsageSummary,
  keys: string[] | undefined,
): MetricOption[] {
  const opts = metricOptions(s);
  if (opts.length === 0) return [];
  if (keys === undefined) return [opts[0]!];
  if (keys.length === 0) return [];
  return opts.filter((o) => keys.includes(o.key));
}

/** Text class for a metric's urgency (consumes theme tokens). */
export function urgencyClass(u: number): string {
  if (u >= 0.9) return "text-danger";
  if (u >= 0.7) return "text-warning";
  return "text-fg-soft";
}
