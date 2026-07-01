<script lang="ts">
  import { NAV, NAV_ITEMS, itemById, type NavGroup } from "../features/settings/nav";
  import ProvidersSection from "./ProvidersSection.svelte";
  import ThemeControls from "./ThemeControls.svelte";
  import SubagentsSection from "./SubagentsSection.svelte";
  import TopbarSettings from "./TopbarSettings.svelte";
  // Per-concern section renderers (one file per settings area).
  import PlayroomSection from "../features/settings/sections/PlayroomSection.svelte";
  import ComposerSection from "../features/settings/sections/ComposerSection.svelte";
  import SidebarEngravingSection from "../features/settings/sections/SidebarEngravingSection.svelte";
  import CavemanSection from "../features/settings/sections/CavemanSection.svelte";
  import HudSection from "../features/settings/sections/HudSection.svelte";
  import StreamingSection from "../features/settings/sections/StreamingSection.svelte";
  import SoundsSection from "../features/settings/sections/SoundsSection.svelte";
  import DoneChimeSection from "../features/settings/sections/DoneChimeSection.svelte";
  import ThreadDoneSoundSection from "../features/settings/sections/ThreadDoneSoundSection.svelte";
  import TestBenchSoundSection from "../features/settings/sections/TestBenchSoundSection.svelte";
  import DoneAnimationSection from "../features/settings/sections/DoneAnimationSection.svelte";
  import LoadersSection from "../features/settings/sections/LoadersSection.svelte";
  import TestAnimationSection from "../features/settings/sections/TestAnimationSection.svelte";
  import AutoCompactSection from "../features/settings/sections/AutoCompactSection.svelte";
  import RetrySection from "../features/settings/sections/RetrySection.svelte";
  import MessageDeliverySection from "../features/settings/sections/MessageDeliverySection.svelte";
  import ExtensionsSection from "../features/settings/sections/ExtensionsSection.svelte";
  import InsomniaSection from "../features/settings/sections/InsomniaSection.svelte";
  import UtilityModelSection from "../features/settings/sections/UtilityModelSection.svelte";
  import ScopedModelsSection from "../features/settings/sections/ScopedModelsSection.svelte";
  import VisionProxySection from "../features/settings/sections/VisionProxySection.svelte";
  import ComputerUseSection from "../features/settings/sections/ComputerUseSection.svelte";
  import AboutSection from "../features/settings/sections/AboutSection.svelte";
  import { snapshot } from "../stores/snapshot.svelte";
  import { Separator } from "../components/ui/separator/index.js";

  let { initialQuery = "", onOpenPlayroom }: { initialQuery?: string; onOpenPlayroom?: () => void } = $props();

  let query = $state(initialQuery);
  let searchInput = $state<HTMLInputElement | null>(null);

  // Follow palette deep-links ("Settings: Theme") that arrive after mount.
  $effect(() => {
    query = initialQuery;
  });
  const q = $derived(query.trim().toLowerCase());

  // `/scoped-models` arrives as an "open:scopedModels" sentinel, not a real
  // search term — keep the search bar empty and open the popover, scrolled into view.
  let scopedModelsOpen = $state(false);
  let scopedModelsSection = $state<HTMLElement | null>(null);
  let awaitingScopedScroll = false;
  $effect(() => {
    if (initialQuery === "open:scopedModels") {
      query = "";
      scopedModelsOpen = true;
      awaitingScopedScroll = true;
    }
  });
  // Once the section mounts (it renders only after the search bar clears), scroll to it.
  $effect(() => {
    if (awaitingScopedScroll && scopedModelsSection) {
      scopedModelsSection.scrollIntoView({ block: "center", behavior: "smooth" });
      awaitingScopedScroll = false;
    }
  });

  /** Typing anywhere in Settings starts the search without clicking the box first. */
  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1) return; // printable chars only
    const t = e.target as HTMLElement | null;
    if (t === searchInput) return;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    query += e.key;
    searchInput?.focus();
    e.preventDefault();
  }

  /* --- Search filtering --- */
  function hit(id: string): boolean {
    const it = itemById.get(id);
    if (!it) return false;
    return q === "" || it.keywords.includes(q);
  }
  function groupHasMatch(g: NavGroup): boolean {
    return g.items.some((it) => hit(it.id));
  }
  const anyMatch = $derived(q === "" || NAV_ITEMS.some((it) => it.keywords.includes(q)));

  const groupById = new Map(NAV.map((g) => [g.id, g] as const));
  // First group (in NAV order) with at least one visible section — suppresses
  // the leading separator above it so the page doesn't start with a rule.
  const firstVisibleGroupId = $derived(NAV.find((g) => groupHasMatch(g))?.id);

  /* --- In-page sidebar scrollspy --- */
  let activeId = $state<string>("");
  let sectionEls = new Map<string, HTMLElement>();
  let scrollEl = $state<HTMLElement | null>(null);
  let io: IntersectionObserver | null = null;

  /** Svelte action: remember a section element so the scrollspy can observe it. */
  function sectionAction(node: HTMLElement, id: string) {
    sectionEls.set(id, node);
    return {
      destroy() {
        if (sectionEls.get(id) === node) sectionEls.delete(id);
      },
    };
  }

  // Pick the active section: the last (in NAV order) whose top has reached
  // the scroll container's content-top anchor line. This mirrors where
  // scrollToSection parks a section (flush with the padding-top).
  function pickActive() {
    const root = scrollEl;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const anchor = parseFloat(getComputedStyle(root).paddingTop) || 0;
    let active: { id: string } | null = null;
    for (const it of NAV_ITEMS) {
      const el = sectionEls.get(it.id);
      if (!el || !hit(it.id)) continue;
      const top = el.getBoundingClientRect().top - rootRect.top;
      if (top <= anchor + 2) active = it; // reached/passed the anchor
      else break; // below the anchor: NAV order means we're done
    }
    if (active) activeId = active.id;
    else if (!activeId && NAV_ITEMS[0]) activeId = NAV_ITEMS[0].id;
  }

  // Suppress scrollspy overwrites while a click-driven smooth scroll is in flight;
  // the IntersectionObserver fires at intermediate positions and would otherwise
  // snap activeId to the section above the target before it reaches the top.
  let programmaticScroll = $state(false);
  let scrollTargetId: string | null = null;

  $effect(() => {
    const root = scrollEl;
    if (!root) return;
    const onScrollEnd = () => {
      if (scrollTargetId) {
        activeId = scrollTargetId;
        scrollTargetId = null;
      }
      programmaticScroll = false;
      pickActive();
    };
    root.addEventListener("scrollend", onScrollEnd);
    return () => root.removeEventListener("scrollend", onScrollEnd);
  });

  // Re-observe rendered sections whenever the search filter changes which are present.
  $effect(() => {
    // depends on which sections are rendered (driven by the query) + the scroll root.
    q;
    anyMatch;
    io?.disconnect();
    const root = scrollEl;
    if (!root) return;
    io = new IntersectionObserver(
      () => {
        if (programmaticScroll) return;
        pickActive();
      },
      { root, rootMargin: "0px 0px -60% 0px", threshold: [0, 0.2, 0.6, 1] },
    );
    for (const it of NAV_ITEMS) {
      const el = sectionEls.get(it.id);
      if (el && hit(it.id)) io.observe(el);
    }
    if (!activeId && NAV_ITEMS[0]) activeId = NAV_ITEMS[0].id;
    return () => io?.disconnect();
  });

  // Snappy-but-smooth custom scroll. The native `behavior: "smooth"` easing is
  // lethargic; this runs a short ease-out (~220ms) so clicks feel immediate.
  let scrollAnim = $state<number | null>(null);
  function scrollToSection(id: string) {
    const root = scrollEl;
    const el = sectionEls.get(id);
    if (!root || !el) return;
    activeId = id;
    programmaticScroll = true;
    scrollTargetId = id;
    if (scrollAnim != null) cancelAnimationFrame(scrollAnim);
    const styles = getComputedStyle(root);
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const target = el.getBoundingClientRect().top - root.getBoundingClientRect().top - paddingTop + root.scrollTop;
    const start = root.scrollTop;
    const distance = target - start;
    if (Math.abs(distance) < 1) {
      programmaticScroll = false;
      pickActive();
      return;
    }
    const duration = Math.min(380, 200 + Math.abs(distance) * 0.55);
    let startTime = 0;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      if (!startTime) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      root.scrollTop = start + distance * easeOut(t);
      if (t < 1) scrollAnim = requestAnimationFrame(step);
      else {
        scrollAnim = null;
        programmaticScroll = false;
        pickActive();
      }
    };
    scrollAnim = requestAnimationFrame(step);
    // Fallback: if scrollend doesn't fire (rare), still release the lock.
    setTimeout(() => {
      scrollAnim = null;
      if (programmaticScroll && scrollTargetId) {
        activeId = scrollTargetId;
        scrollTargetId = null;
        programmaticScroll = false;
        pickActive();
      }
    }, duration + 120);
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<main class="flex h-full flex-1 flex-col" data-testid="settings-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-3 px-6">
    <h1 class="text-sm font-medium text-fg-soft">Settings</h1>
    <input
      type="search"
      bind:value={query}
      placeholder="Search settings…"
      class="ml-auto w-48 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg outline-none focus:border-border-focus"
      data-testid="settings-search"
      aria-label="Search settings"
      bind:this={searchInput}
    />
  </header>
  <div class="flex min-h-0 flex-1">
    <!-- In-page nav: jumps within the scroll pane (Cloudflare-style, not separate views). -->
    <nav class="settings-nav w-48 shrink-0 overflow-y-auto px-2 py-4" aria-label="Settings sections">
      {#each NAV as g (g.id)}
        {#if groupHasMatch(g)}
          <div class="mb-4">
            <p class="settings-nav-group mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-fainter">{g.label}</p>
            <ul class="flex flex-col gap-0.5">
              {#each g.items as it (it.id)}
                {#if hit(it.id)}
                  <li>
                    <button
                      type="button"
                      class="settings-nav-item w-full rounded-md px-2 py-1 text-left text-xs text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg {activeId === it.id ? 'is-active bg-surface-2 text-fg' : ''}"
                      onclick={() => scrollToSection(it.id)}
                      aria-current={activeId === it.id ? "true" : undefined}
                    >{it.label}</button>
                  </li>
                {/if}
              {/each}
            </ul>
          </div>
        {/if}
      {/each}
    </nav>

    <Separator orientation="vertical" />

    <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-6 py-6">
      <div class="mx-auto flex max-w-xl flex-col gap-4">
        {#snippet groupHeader(g: NavGroup)}
          {#if groupHasMatch(g)}
            {#if g.id !== firstVisibleGroupId}
              <Separator class="mt-6 mb-6" />
            {/if}
            <h2 class="px-1 text-xl font-semibold tracking-wide text-fg-soft">{g.label}</h2>
          {/if}
        {/snippet}

        {#if !anyMatch}
          <p class="text-center text-xs text-fainter" data-testid="settings-search-empty">
            No settings match “{query.trim()}”.
          </p>
        {/if}

        {@render groupHeader(groupById.get("account")!)}
        {#if hit("providers")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="providers" use:sectionAction={"providers"}>
          <ProvidersSection />
        </section>
        {/if}

        {@render groupHeader(groupById.get("appearance")!)}
        {#if hit("playroom")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="playroom" use:sectionAction={"playroom"}>
          <PlayroomSection {onOpenPlayroom} />
        </section>
        {/if}

        {#if hit("theme")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="theme" use:sectionAction={"theme"}>
          <ThemeControls />
        </section>
        {/if}

        {#if hit("composer")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="composer" use:sectionAction={"composer"}>
          <ComposerSection />
        </section>
        {/if}

        {#if hit("sidebar")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="sidebar" use:sectionAction={"sidebar"}>
          <SidebarEngravingSection />
        </section>
        {/if}

        {#if hit("caveman")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="caveman" use:sectionAction={"caveman"}>
          <CavemanSection />
        </section>
        {/if}

        {#if hit("hud")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="hud" use:sectionAction={"hud"}>
          <HudSection />
        </section>
        {/if}

        {#if hit("doneAnimation")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="doneAnimation" use:sectionAction={"doneAnimation"}>
          <DoneAnimationSection />
        </section>
        {/if}

        {#if hit("loaders")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="loaders" use:sectionAction={"loaders"}>
          <LoadersSection />
        </section>
        {/if}

        {#if hit("streaming")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="streaming" use:sectionAction={"streaming"}>
          <StreamingSection />
        </section>
        {/if}

        {@render groupHeader(groupById.get("sounds")!)}
        {#if hit("sounds")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="sounds" use:sectionAction={"sounds"}>
          <SoundsSection />
        </section>
        {/if}

        {#if hit("doneChime")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="doneChime" use:sectionAction={"doneChime"}>
          <DoneChimeSection />
        </section>
        {/if}

        {#if hit("threadDoneSound")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="threadDoneSound" use:sectionAction={"threadDoneSound"}>
          <ThreadDoneSoundSection />
        </section>
        {/if}

        {#if hit("testBenchSound")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="testBenchSound" use:sectionAction={"testBenchSound"}>
          <TestBenchSoundSection />
        </section>
        {/if}

        {#if hit("testAnimation")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="testAnimation" use:sectionAction={"testAnimation"}>
          <TestAnimationSection />
        </section>
        {/if}

        {@render groupHeader(groupById.get("behavior")!)}
        {#if hit("autoCompact")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="autoCompact" use:sectionAction={"autoCompact"}>
          <AutoCompactSection />
        </section>
        {/if}

        {#if hit("retry")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="retry" use:sectionAction={"retry"}>
          <RetrySection />
        </section>
        {/if}

        {#if hit("messageDelivery")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="messageDelivery" use:sectionAction={"messageDelivery"}>
          <MessageDeliverySection />
        </section>
        {/if}

        {#if hit("extensions")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="extensions" use:sectionAction={"extensions"}>
          <ExtensionsSection />
        </section>
        {/if}

        {#if hit("insomnia")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="insomnia" use:sectionAction={"insomnia"}>
          <InsomniaSection />
        </section>
        {/if}

        {#if hit("topbar")}
        <TopbarSettings />
        {/if}

        {#if hit("subagents")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="subagents" data-testid="subagents-section" use:sectionAction={"subagents"}>
          <SubagentsSection projects={snapshot.current?.projects ?? []} />
        </section>
        {/if}

        {@render groupHeader(groupById.get("models")!)}
        {#if hit("utilityModel")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="utilityModel" use:sectionAction={"utilityModel"}>
          <UtilityModelSection />
        </section>
        {/if}

        {#if hit("scopedModels")}
        <section bind:this={scopedModelsSection} class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="scopedModels" data-testid="scoped-models-section" use:sectionAction={"scopedModels"}>
          <ScopedModelsSection bind:open={scopedModelsOpen} />
        </section>
        {/if}

        {#if hit("visionProxy")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="visionProxy" use:sectionAction={"visionProxy"}>
          <VisionProxySection />
        </section>
        {/if}

        {@render groupHeader(groupById.get("system")!)}
        {#if hit("computerUse")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="computerUse" data-testid="computer-use-section" use:sectionAction={"computerUse"}>
          <ComputerUseSection />
        </section>
        {/if}

        {#if hit("about")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="about" use:sectionAction={"about"}>
          <AboutSection />
        </section>
        {/if}
      </div>
    </div>
  </div>
</main>

<style>
  /* In-page settings sidebar — local to this view. */
  .settings-nav-item.is-active {
    background: var(--color-surface-2);
    color: var(--color-fg);
    font-weight: 500;
    box-shadow: inset 2px 0 0 0 var(--color-accent);
  }
  /* Sections render inside child components, so this scroll spacing must be global. */
  :global(.settings-section) {
    scroll-margin-top: 1rem;
  }
</style>
