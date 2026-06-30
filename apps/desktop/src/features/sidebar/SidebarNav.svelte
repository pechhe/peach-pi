<script lang="ts">
  import type { AppView } from "@peach-pi/shared-types";
  import { usage } from "../../stores/usage.svelte";
  import { usagePrefs } from "../../stores/usage-prefs.svelte";
  import { featuredMetrics, shortTag, urgencyClass, fmtResetsIn } from "../../lib/usage-featured";
  import MovingHighlight from "../../app/MovingHighlight.svelte";
  import UsagePopover from "../../app/UsagePopover.svelte";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Settings from "@lucide/svelte/icons/settings";
  import Plug from "@lucide/svelte/icons/plug";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Radio from "@lucide/svelte/icons/radio";
  import Gauge from "@lucide/svelte/icons/gauge";
  import { sidebarStore } from "./sidebar.svelte";

  let {
    activeView,
    automationCount = 0,
    onOpenView,
    remoteFirst = false,
  }: {
    activeView: AppView;
    automationCount?: number;
    onOpenView: (view: AppView) => void;
    remoteFirst?: boolean;
  } = $props();

  let usageAnchor: HTMLButtonElement | null = $state(null);
  let usageOpen = $state(false);

  function toggleUsagePopover(): void {
    usageOpen = !usageOpen;
  }

  // Featured (pinned) metrics for the compact sidebar line, one per provider.
  const featuredLine = $derived(
    usage.summaries
      .filter((s) => !usagePrefs.isHidden(s.provider))
      .flatMap((s) =>
        featuredMetrics(s, usagePrefs.keysFor(s.provider)).map((m) => ({ provider: s.provider, key: m.key, m })),
      ),
  );
</script>

<nav class="px-3 pb-2">
  <MovingHighlight
    class="flex flex-col gap-0.5 moving-highlight--nav"
    itemSelector=".main-nav-item"
    activeSelector=".main-nav-item--active"
  >
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'automations' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("automations")}
      data-testid="nav-automations"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><AlarmClock size={15} /> Automations</span>
      {#if automationCount > 0}
        <span class="num-badge" data-testid="automations-badge">{automationCount}</span>
      {/if}
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'skills' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("skills")}
      data-testid="nav-skills"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><BookOpen size={15} /> Skills</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'extensions' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("extensions")}
      data-testid="nav-extensions"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><Puzzle size={15} /> Extensions</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'settings' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("settings")}
      data-testid="nav-settings"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><Settings size={15} /> Settings</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'connections' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("connections")}
      data-testid="nav-connections"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><Plug size={15} /> Connections</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'bws' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("bws")}
      data-testid="nav-bws"
      data-press="rotary"
    >
      <span class="flex items-center gap-2.5"><KeyRound size={15} /> Secrets</span>
    </button>
    <button
      class="main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]
        {activeView === 'remote' ? 'main-nav-item--active text-fg' : 'text-muted hover:text-fg'}"
      onclick={() => onOpenView("remote")}
      data-testid="nav-remote"
      data-press="rotary"
      data-remote-first={remoteFirst ? "on" : undefined}
    >
      <span class="flex items-center gap-2.5 {remoteFirst ? 'remote-first-pulse' : ''}">
        <Radio size={15} /> Remote
      </span>
    </button>
    <div class="main-nav-item--usage relative" data-nav-usage-host>
      <button
        bind:this={usageAnchor}
        class="main-nav-item flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-fg"
        onclick={toggleUsagePopover}
        data-testid="nav-usage"
        data-press="rotary"
      >
        <span class="flex items-center gap-2.5"><Gauge size={15} /> Usage</span>
        {#if featuredLine.length > 0}
          <span class="flex items-center gap-1.5 text-[10px] text-fainter" data-testid="nav-usage-line">
            {#each featuredLine as { provider, key, m } (provider + key)}
              <span>
                <span class="text-fainter">{shortTag(provider)}</span>
                <span class="ml-0.5 {urgencyClass(m.urgency)}">{m.remainingPct !== null && m.remainingPct <= 0 ? `${fmtResetsIn(m.resetAt, sidebarStore.now)} left` : m.value}</span>
              </span>
            {/each}
          </span>
        {/if}
      </button>
      {#if usageOpen}
        <UsagePopover anchor={usageAnchor} onClose={() => (usageOpen = false)} />
      {/if}
    </div>
  </MovingHighlight>
</nav>

<style>
  /* Nav buttons are mouse/keyboard-activated, not tab-stopped — the
     global :focus-visible ring would otherwise linger on the clicked
     item (Chromium keeps :focus-visible after a click reached from
     keyboard focus). Suppress it here; the active state is already
     shown via .main-nav-item--active. */
  .main-nav-item:focus-visible {
    outline: none;
  }
</style>
