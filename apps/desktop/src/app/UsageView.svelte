<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderUsageSummary, UsageWindow } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { usage } from "../stores/usage.svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Gauge from "@lucide/svelte/icons/gauge";
  import { playButtonClick } from "../lib/sound/button-click-sound";

  // Re-tick every 15s so reset countdowns stay fresh without a reload.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(id);
  });

  onMount(() => {
    void usage.load();
    usage.startPolling();
    return () => usage.stopPolling();
  });

  // Live updates pushed from main (after a forced refresh).
  api.on("event:usageChanged", () => void usage.load());

  function relativeReset(resetAt: string | null, ref: number): string {
    if (!resetAt) return "—";
    const diffMs = Date.parse(resetAt) - ref;
    if (!Number.isFinite(diffMs)) return "—";
    if (diffMs <= 0) return "resets soon";
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMin = mins % 60;
    if (hrs < 24) return remMin ? `${hrs}h ${remMin}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
  }

  // "updated X ago" for a past timestamp (fetchedAt).
  function relativeAgo(then: string | null, ref: number): string {
    if (!then) return "";
    const diffMs = ref - Date.parse(then);
    if (!Number.isFinite(diffMs) || diffMs < 0) return "";
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function fmtMoney(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return `$${v.toFixed(2)}`;
  }

  // How utilized a window is, classed for the progress-bar colour.
  function barClass(usedPct: number): string {
    if (usedPct >= 90) return "usage-bar--critical";
    if (usedPct >= 70) return "usage-bar--warn";
    return "usage-bar--ok";
  }

  const summaries = $derived(usage.summaries);

  $effect(() => {
    // touch `now` so countdowns recompute (declared above; safe read here).
    void now;
  });

  function refresh() {
    playButtonClick();
    void usage.refresh();
  }
</script>

<main class="flex h-full flex-1 flex-col overflow-y-auto" data-testid="usage-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-6">
    <Gauge size={16} class="text-muted" />
    <h1 class="text-sm font-semibold text-fg">Usage</h1>
    <span class="ml-2 text-xs text-fainter">subscription quotas &amp; spend</span>
    <div class="ml-auto flex items-center gap-2">
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
        onclick={refresh}
        title="Refresh"
        aria-label="Refresh"
        disabled={usage.refreshing}
      >
        <RefreshCw size={14} class={usage.refreshing ? "animate-spin" : ""} />
      </button>
    </div>
  </header>

  <div class="mx-auto w-full max-w-3xl px-6 pb-10">
    {#if usage.error}
      <p class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400" data-testid="usage-error">
        {usage.error}
      </p>
    {/if}

    {#if usage.loading && summaries.length === 0}
      <p class="py-10 text-center text-sm text-fainter">Loading usage…</p>
    {:else}
      <div class="mt-2 flex flex-col gap-3">
        {#each summaries as s (s.provider)}
          {@render providerCard(s)}
        {/each}
      </div>
    {/if}
  </div>
</main>

{#snippet windowRow(label: string, window: UsageWindow | null, ref: number)}
  {#if window}
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs">
        <span class="text-muted">{label}</span>
        <span class="text-fg-soft">{window.usedPct.toFixed(0)}% used · resets {relativeReset(window.resetAt, ref)}</span>
      </div>
      <div class="usage-bar">
        <div class="usage-bar__fill {barClass(window.usedPct)}" style="width: {Math.min(100, Math.max(0, window.usedPct))}%"></div>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet providerCard(s: ProviderUsageSummary)}
  <section
    class="rounded-xl border border-border bg-surface p-4"
    data-testid="usage-card"
    data-provider={s.provider}
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-fg">{s.label}</h2>
        {#if !s.configured}
          <span class="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-fainter">not configured</span>
        {:else if s.state === "ok"}
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Live" />
        {:else if s.state === "partial"}
          <span class="h-1.5 w-1.5 rounded-full bg-amber-400" title="Partial" />
        {:else if s.state === "manual"}
          <span class="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">dashboard</span>
        {:else}
          <span class="h-1.5 w-1.5 rounded-full bg-red-400" title="Unknown" />
        {/if}
      </div>
      {#if s.fetchedAt}
        <span class="text-[10px] text-fainter">updated {relativeAgo(s.fetchedAt, now)}</span>
      {/if}
    </div>

    <div class="mt-3">
      {#if !s.configured}
        <p class="text-xs text-fainter">{s.note ?? "No credentials configured for this provider."}</p>
      {:else if s.state === "manual"}
        <p class="text-xs text-muted">{s.note ?? "Usage is only viewable on the provider dashboard."}</p>
        {#if s.dashboardUrl}
          <a
            href={s.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-soft transition hover:bg-surface"
          >Open dashboard →</a>
        {/if}
      {:else if !s.summary}
        <p class="text-xs text-muted">{s.note ?? "Could not fetch usage right now."}</p>
      {:else if s.summary.kind === "quota"}
        <div class="flex flex-col gap-2.5">
          {@render windowRow("5-hour window", s.summary.fiveHours, now)}
          {@render windowRow("Weekly window", s.summary.weekly, now)}
        </div>
      {:else}
        {@render balanceRows(s)}
      {/if}
    </div>
  </section>
{/snippet}

{#snippet balanceRows(s: ProviderUsageSummary)}
  <div class="flex flex-wrap gap-x-8 gap-y-1.5">
    {#if s.summary?.kind === "balance" && s.summary.balanceUSD !== null}
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-wider text-fainter">Remaining</span>
        <span class="text-lg font-semibold text-fg">{fmtMoney(s.summary.balanceUSD)}</span>
      </div>
    {/if}
    {#if s.summary?.kind === "balance" && s.summary.spentWeek !== null}
      {@render spendStat("This week", s.summary.spentWeek)}
    {/if}
    {#if s.summary?.kind === "balance" && s.summary.spentMonth !== null}
      {@render spendStat("This month", s.summary.spentMonth)}
    {/if}
    {#if s.summary?.kind === "balance" && s.summary.spentDay !== null}
      {@render spendStat("Today", s.summary.spentDay)}
    {/if}
  </div>
  {#if s.summary?.kind === "balance" && s.summary.extra.length > 0}
    <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 pt-2.5">
      {#each s.summary.extra as m (m.label)}
        <div class="flex flex-col">
          <span class="text-[10px] uppercase tracking-wider text-fainter">{m.label}</span>
          <span class="text-xs font-medium text-fg-soft">{m.value}</span>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet spendStat(label: string, value: number)}
  <div class="flex flex-col">
    <span class="text-[10px] uppercase tracking-wider text-fainter">{label}</span>
    <span class="text-sm font-medium text-fg-soft">{fmtMoney(value)}</span>
  </div>
{/snippet}

<style>
  .usage-bar {
    height: 6px;
    width: 100%;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--color-surface-2) 70%, transparent);
    overflow: hidden;
  }
  .usage-bar__fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 300ms ease;
  }
  .usage-bar--ok { background: var(--color-accent); }
  .usage-bar--warn { background: #f59e0b; }
  .usage-bar--critical { background: #ef4444; }
</style>
