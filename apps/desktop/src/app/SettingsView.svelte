<script lang="ts">
  import { onMount } from "svelte";
  import type {
    AgentBrowserState,
    CuaDriverStatus,
    ModelInfo,
    PiSettings,
    VisionProxyConfig,
  } from "@peach-pi/shared-types";
  import {
    setSoundsMuted,
    soundsMuted,
    setDoneSoundVariant,
    getDoneSoundVariant,
    setArchiveSoundVariant,
    getArchiveSoundVariant,
    setTestSoundVariant,
    getTestSoundVariant,
  } from "../lib/sound/sound-prefs";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import {
    DONE_SOUND_OPTIONS,
    playDoneSound,
    playArchiveSound,
    type DoneSoundVariant,
  } from "../lib/sound/done-sound";
  import {
    TEST_SOUND_OPTIONS,
    playTestSound,
    type TestSoundVariant,
  } from "../lib/sound/test-sound";
  import {
    theme,
    type ComposerStyle,
  } from "../lib/theme.svelte";
  import { clickCopy } from "../lib/code-copy";
  import {
    STREAM_LOOKS,
    STREAM_SPEEDS,
    streamReveal,
    type StreamLook,
    type StreamSpeed,
  } from "../lib/stream-reveal.svelte";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import { Switch } from "../components/ui/switch";
  import ModelScopeSelect from "../components/ui/model-scope-select/model-scope-select.svelte";
  import DoneBurstPlayground from "./DoneBurstPlayground.svelte";
  import TestBurstPlayground from "./TestBurstPlayground.svelte";
  import DotMatrixPlayground from "./DotMatrixPlayground.svelte";
  import ThemeControls from "./ThemeControls.svelte";
  import SubagentsSection from "./SubagentsSection.svelte";
  import ProvidersSection from "./ProvidersSection.svelte";
  import TopbarSettings from "./TopbarSettings.svelte";
  import Check from "@lucide/svelte/icons/check";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import { autoCompact } from "../stores/auto-compact.svelte";
  import { caveman } from "../stores/caveman.svelte";
  import { piSettings } from "../stores/pi-settings.svelte";
  import { scopedModels } from "../stores/scoped-models.svelte";
  import { visionProxy } from "../stores/vision-proxy.svelte";
  import { snapshot } from "../stores/snapshot.svelte";

  let { initialQuery = "", onOpenPlayroom }: { initialQuery?: string; onOpenPlayroom?: () => void } = $props();

  const hudAutoReveal = $derived(snapshot.current?.ui.hudAutoRevealOnFinish ?? false);

  /**
   * Settings navigation model.
   * One entry per rendered <section>, grouped into a handful of areas that
   * drive the Cloudflare-style in-page sidebar (jump, don't switch views).
   * `keywords` powers the search filter; an empty query shows everything.
   */
  type NavItem = { id: string; label: string; keywords: string };
  type NavGroup = { id: string; label: string; items: NavItem[] };
  const NAV: NavGroup[] = [
    {
      id: "account",
      label: "Account",
      items: [
        { id: "providers", label: "Providers & login", keywords: "providers login account sign in oauth subscription api key anthropic claude openai chatgpt codex copilot github auth credentials logout token model provider" },
      ],
    },
    {
      id: "appearance",
      label: "Appearance",
      items: [
        { id: "playroom", label: "Playroom", keywords: "appearance playroom live stage tune look feel messages done animation alerts chassis" },
        { id: "theme", label: "Theme", keywords: "theme appearance applies to every window colors" },
        { id: "composer", label: "Composer", keywords: "composer light silver dark anodized chassis auto follows your theme" },
        { id: "sidebar", label: "Sidebar engraving", keywords: "sidebar engraving metal surface letterpress text tune sidebar-device" },
        { id: "caveman", label: "Caveman intensity", keywords: "caveman intensity level composer toggle" },
        { id: "hud", label: "HUD auto-reveal", keywords: "hud auto-reveal expand chat thread finishes" },
        { id: "doneAnimation", label: "Done animation", keywords: "done animation mark done card animation preview play" },
        { id: "loaders", label: "Loaders", keywords: "loaders dot matrix spinner square hex triangle sidebar chat agents hourglass neon drift glow bloom animate" },
        { id: "streaming", label: "Streaming", keywords: "streaming text assistant replies reveal stream" },
      ],
    },
    {
      id: "sounds",
      label: "Sounds",
      items: [
        { id: "sounds", label: "Sounds", keywords: "sounds button clicks done chime mute" },
        { id: "doneChime", label: "Done chime", keywords: "done chime celebration cue thread finishes preview" },
        { id: "threadDoneSound", label: "Thread done sound", keywords: "thread done sound mark done archive click precision archive latch metallic preview" },
        { id: "testBenchSound", label: "Test bench sound", keywords: "test bench sound mark to test relay tick diagnostic chirp stamp flask inspection preview" },
        { id: "testAnimation", label: "Test bench animation", keywords: "test animation mark to test card animation preview play bench stamp scan relay" },
      ],
    },
    {
      id: "behavior",
      label: "Behavior",
      items: [
        { id: "autoCompact", label: "Auto-compaction", keywords: "auto-compaction compact context usage threshold tokens percentage" },
        { id: "retry", label: "Retry on error", keywords: "retry on error network drop transient exponential backoff wait doubles" },
        { id: "messageDelivery", label: "Message delivery", keywords: "message delivery steering mode follow-up mode" },
        { id: "extensions", label: "Extensions", keywords: "extensions auto update packages pi update periodic refresh" },
        { id: "insomnia", label: "Keep awake", keywords: "insomnia sleep idle caffeinate prevent mac awake while running" },
        { id: "topbar", label: "Topbar", keywords: "topbar top bar widgets devtap fallow customization show hide chip" },
        { id: "subagents", label: "Subagents", keywords: "subagents agents scouting research verification cheap model roster subagent roster" },
      ],
    },
    {
      id: "models",
      label: "Models",
      items: [
        { id: "utilityModel", label: "Utility model", keywords: "utility model background tasks thread titles commit messages fast inexpensive" },
        { id: "scopedModels", label: "Scoped models", keywords: "scoped models scopedmodels enable disable model scope composer selector enabled models available list" },
        { id: "visionProxy", label: "Vision proxy", keywords: "vision proxy images description describe blind text-only model fallback always off consent claude gemini qwen" },
      ],
    },
    {
      id: "system",
      label: "System",
      items: [
        { id: "computerUse", label: "Computer use", keywords: "computer use agent browser cua driver native desktop automation accessibility permissions install setup" },
        { id: "about", label: "About", keywords: "about peach-pi version" },
      ],
    },
  ];
  const NAV_ITEMS = NAV.flatMap((g) => g.items);
  const itemById = new Map(NAV_ITEMS.map((it) => [it.id, it]));

  let query = $state(initialQuery);
  let searchInput = $state<HTMLInputElement | null>(null);

  /* ------------------------------------------------------------------ */
  /* Sidebar engraving overrides (live-tuned via sliders in Settings).   */
  /* ------------------------------------------------------------------ */
  let engrave = $state({
    angle: 78, metalL: 0.79, metalR: 0.92,
    lipPx: 2, lipOp: 0.8, inkL: 0.20, inkC: 0.005, inkH: 250,
  });
  let engraveStyleEl: HTMLStyleElement | undefined;
  function buildEngraveCSS(a: number, mL: number, mR: number, px: number, op: number, iL: number, iC: number, iH: number) {
    const mRDark = 0.135 + (mR - mL) * 0.4;
    const mLDark = 0.135;
    return `
.sidebar-device {
  background:
    linear-gradient(180deg, oklch(1 0.002 ${iH} / 0.14), transparent 18%, transparent 82%, oklch(0.3 0.004 ${iH} / 0.08)),
    repeating-linear-gradient(180deg, oklch(0 0 0 / 0.03) 0 1px, oklch(1 0 0 / 0.03) 1px 2px),
    linear-gradient(${a}deg, oklch(${mL} 0.003 ${iH}) 0px, oklch(${(mL + mR) / 2} 0.003 ${iH}) 170px, oklch(${mR} 0.002 ${iH}) 340px);
  background-blend-mode: overlay, soft-light, normal;
}
:root[data-composer="dark"] .sidebar-device {
  background:
    linear-gradient(180deg, oklch(1 0.002 ${iH + 15} / 0.08), transparent 18%, transparent 82%, oklch(0 0 0 / 0.12)),
    repeating-linear-gradient(180deg, oklch(1 0 0 / 0.02) 0 1px, oklch(0 0 0 / 0.04) 1px 2px),
    linear-gradient(${a}deg, oklch(${mLDark} 0.004 ${iH + 15}) 0px, oklch(${(mLDark + mRDark) / 2} 0.004 ${iH + 15}) 170px, oklch(${mRDark} 0.004 ${iH + 15}) 340px);
  background-blend-mode: overlay, soft-light, normal;
}
.sidebar-device .main-nav-item > span,
.sidebar-device .engraved {
  color: oklch(${iL} ${iC} ${iH});
  text-shadow: 0 ${px}px 0 oklch(1 0.002 ${iH} / ${op});
}
.sidebar-device .main-nav-item > span svg,
.sidebar-device .engraved svg {
  filter: drop-shadow(0 ${px}px 0 oklch(1 0.002 ${iH} / ${op}));
}
:root[data-composer="dark"] .sidebar-device .main-nav-item > span,
:root[data-composer="dark"] .sidebar-device .engraved {
  color: oklch(${1 - iL} ${iC} ${iH + 15});
  text-shadow: 0 -${px}px 0 oklch(0 0 0 / ${op});
}
:root[data-composer="dark"] .sidebar-device .main-nav-item > span svg,
:root[data-composer="dark"] .sidebar-device .engraved svg {
  filter: drop-shadow(0 -${px}px 0 oklch(0 0 0 / ${op}));
}
/* Active engraved label lights up (one colour, both schemes) — overrides the
   machined-ink repaint above for the active nav item + Projects header. */
.sidebar-device .main-nav-item--active > span,
.sidebar-device .engraved--active {
  color: var(--engrave-active, oklch(0.74 0.185 52));
  text-shadow: 0 ${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 35%, oklch(1 0.002 ${iH} / ${op})), 0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
.sidebar-device .main-nav-item--active > span svg,
.sidebar-device .engraved--active svg {
  filter: drop-shadow(0 ${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 35%, oklch(1 0.002 ${iH} / ${op}))) drop-shadow(0 0 5px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span,
:root[data-composer="dark"] .sidebar-device .engraved--active {
  color: var(--engrave-active, oklch(0.74 0.185 52));
  text-shadow: 0 -${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 30%, oklch(0 0 0 / ${op})), 0 0 6px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent);
}
:root[data-composer="dark"] .sidebar-device .main-nav-item--active > span svg,
:root[data-composer="dark"] .sidebar-device .engraved--active svg {
  filter: drop-shadow(0 -${px}px 0 color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 30%, oklch(0 0 0 / ${op}))) drop-shadow(0 0 5px color-mix(in srgb, var(--engrave-active, oklch(0.74 0.185 52)) 55%, transparent));
}
`;
  }
  function injectEngraveCSS() {
    if (!engraveStyleEl) return;
    const { angle, metalL, metalR, lipPx, lipOp, inkL, inkC, inkH } = engrave;
    engraveStyleEl.textContent = buildEngraveCSS(angle, metalL, metalR, lipPx, lipOp, inkL, inkC, inkH);
  }
  $effect(() => { engrave.angle; engrave.metalL; engrave.metalR; engrave.lipPx; engrave.lipOp; engrave.inkL; engrave.inkC; engrave.inkH; injectEngraveCSS(); });
  onMount(() => {
    engraveStyleEl = document.createElement('style');
    engraveStyleEl.dataset.engraveControls = 'true';
    document.head.appendChild(engraveStyleEl);
    injectEngraveCSS();
    return () => engraveStyleEl?.remove();
  });
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

  // Pick the topmost visible section in NAV order as the active one.
  function pickActive() {
    const root = scrollEl;
    if (!root) return;
    let best: { id: string; top: number } | null = null;
    for (const it of NAV_ITEMS) {
      const el = sectionEls.get(it.id);
      if (!el || !hit(it.id)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= 0) continue; // scrolled past (incl. touching top edge)
      if (rect.top > root.clientHeight + 4) continue; // below viewport
      if (best === null || rect.top < best.top) best = { id: it.id, top: rect.top };
    }
    if (best) activeId = best.id;
    else if (!activeId && NAV_ITEMS[0]) activeId = NAV_ITEMS[0].id;
  }

  // Suppress scrollspy overwrites while a click-driven smooth scroll is in flight;
  // the IntersectionObserver fires at intermediate positions and would otherwise
  // snap activeId to the section above the target before it reaches the top.
  let programmaticScroll = $state(false);

  $effect(() => {
    const root = scrollEl;
    if (!root) return;
    const onScrollEnd = () => {
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
  }

  let muted = $state(soundsMuted());
  let doneVariant = $state(getDoneSoundVariant() as DoneSoundVariant);
  let archiveVariant = $state(getArchiveSoundVariant() as DoneSoundVariant);
  let testVariant = $state(getTestSoundVariant() as TestSoundVariant);
  let version = $state("");
  let models = $state<ModelInfo[]>([]);
  let utilityModel = $state<ModelInfo | null>(null);
  /** key: provider:id — for the <select> value. Empty string = use defaults. */
  let selectedKey = $state("");

  const keyOf = (m: { provider: string; id: string }) => `${m.provider}:${m.id}`;
  const byKey = $derived(new Map(models.map((m) => [keyOf(m), m])));
  // Scoped models ∪ the currently-configured utility model. The persisted
  // selection may fall outside the scoped list (e.g. the user unscoped it, or
  // the scoped list hasn't loaded yet); a Select built only from `models`
  // can't represent it, so the trigger renders the placeholder — visually
  // indistinguishable from "Default", and a re-pick silently nulls it out.
  const grouped = $derived.by(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = groups.get(m.provider);
      if (arr) arr.push(m);
      else groups.set(m.provider, [m]);
    }
    // Surface the configured utility model even when it isn't in the scoped
    // list, so the Select can display and re-select it.
    if (utilityModel && !byKey.has(keyOf(utilityModel))) {
      const arr = groups.get(utilityModel.provider);
      if (arr) arr.push(utilityModel);
      else groups.set(utilityModel.provider, [utilityModel]);
    }
    return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
  });

  /** Total retry wait time with exponential backoff: base * (2^n - 1). */
  const retryTotalSeconds = $derived.by(() => {
    if (piSettings.retryMaxRetries <= 0) return 0;
    const totalMs = piSettings.retryBaseDelayMs * (Math.pow(2, piSettings.retryMaxRetries) - 1);
    return Math.round(totalMs / 1000);
  });

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  onMount(async () => {
    version = (await api.invoke("app:ping")).version;
    [models, utilityModel] = await Promise.all([
      api.invoke("app:listModels"),
      api.invoke("app:getUtilityModel"),
    ]);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
    await autoCompact.load();
    await piSettings.load();
    await caveman.load();
    await visionProxy.load();
    await scopedModels.load();
    void loadComputerUse();
  });

  function saveAutoCompactPercent(e: Event) {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    const percent = Math.min(100, Math.max(1, Math.round(value)));
    void autoCompact.set({ percent, tokens: autoCompact.tokens });
  }

  function saveAutoCompactTokens(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    const tokens = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
    void autoCompact.set({ percent: autoCompact.percent, tokens });
  }

  function toggleSounds() {
    muted = !muted;
    setSoundsMuted(muted);
    if (!muted) playButtonClick("click");
  }

  function pickDoneVariant(value: string) {
    const v = value as DoneSoundVariant;
    doneVariant = v;
    setDoneSoundVariant(v);
    playDoneSound(v); // live preview
  }

  function previewDone() {
    playDoneSound(doneVariant);
  }

  function pickArchiveVariant(value: string) {
    const v = value as DoneSoundVariant;
    archiveVariant = v;
    setArchiveSoundVariant(v);
    playArchiveSound(v); // live preview
  }

  function previewArchive() {
    playArchiveSound(archiveVariant);
  }

  function pickTestVariant(value: string) {
    const v = value as TestSoundVariant;
    testVariant = v;
    setTestSoundVariant(v);
    playTestSound(v); // live preview
  }

  function previewTest() {
    playTestSound(testVariant);
  }

  async function pickUtilityModel(key: string) {
    selectedKey = key;
    // Resolve from the merged scoped ∪ persisted set so a selection that's
    // currently out of scope (but still configured) isn't silently nulled out.
    const merged = new Map(grouped.flatMap((g) => g.items).map((m) => [keyOf(m), m]));
    const model = key ? merged.get(key) ?? byKey.get(key) ?? null : null;
    utilityModel = await api.invoke("app:setUtilityModel", model);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
  }

  /** provider:id for the selected vision model (matches the utility-model key shape). */
  const visionKey = $derived(`${visionProxy.provider}:${visionProxy.modelId}`);
  let installingVision = $state(false);
  let visionError = $state("");

  // Computer use: native agent_browser (web) + cua-driver (native desktop).
  let agentBrowser = $state<AgentBrowserState | null>(null);
  let cuaDriver = $state<CuaDriverStatus | null>(null);
  let installingBrowser = $state(false);
  let grantingCua = $state(false);
  // A step is "ok" when installed and (for cua-driver) permissions granted.
  const browserReady = $derived(!!agentBrowser?.installed && !!agentBrowser?.binaryVersion);
  const cuaReady = $derived(
    !!cuaDriver?.installed &&
      cuaDriver.accessibility === "granted" &&
      cuaDriver.screenRecording === "granted",
  );
  const computerUseReady = $derived(browserReady && cuaReady);

  async function loadComputerUse() {
    // allSettled: a hung/rejected status (e.g. cua check_permissions while a
    // TCC prompt is open) must not mask the other component's state.
    const [ab, cd] = await Promise.allSettled([
      api.invoke("agentBrowser:state"),
      api.invoke("cuaDriver:status"),
    ]);
    if (ab.status === "fulfilled") agentBrowser = ab.value;
    if (cd.status === "fulfilled") cuaDriver = cd.value;
  }

  async function installAgentBrowser() {
    if (installingBrowser || agentBrowser?.installed) return;
    installingBrowser = true;
    try {
      await api.invoke("agentBrowser:install");
      await loadComputerUse();
    } finally {
      installingBrowser = false;
    }
  }

  async function grantCuaPermissions() {
    if (grantingCua) return;
    grantingCua = true;
    try {
      await api.invoke("cuaDriver:grantPermissions");
      // Grant is interactive; re-poll shortly so the badges reflect the result.
      setTimeout(() => void loadComputerUse(), 3000);
    } finally {
      grantingCua = false;
    }
  }

  async function pickVisionModel(key: string) {
    if (visionProxy.modelLocked || !key) return;
    const model = byKey.get(key);
    if (!model) return;
    visionError = "";
    try {
      await visionProxy.setModel(model);
    } catch (err) {
      visionError = String(err);
    }
  }

  async function installVisionProxy() {
    if (installingVision || visionProxy.installed) return;
    installingVision = true;
    visionError = "";
    try {
      const res = await visionProxy.install();
      if (!res.ok) visionError = res.error ?? "Install failed.";
    } finally {
      installingVision = false;
    }
  }

  function toggleRetryEnabled() {
    void piSettings.patch({ retry: { enabled: !piSettings.retryEnabled, maxRetries: piSettings.retryMaxRetries, baseDelayMs: piSettings.retryBaseDelayMs, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }

  function saveRetryCount(e: Event) {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    void piSettings.patch({ retry: { enabled: piSettings.retryEnabled, maxRetries: Math.max(0, Math.min(10, Math.round(value))), baseDelayMs: piSettings.retryBaseDelayMs, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }

  function saveRetryDelay(e: Event) {
    const seconds = Number((e.currentTarget as HTMLInputElement).value);
    const ms = Math.max(500, Math.round(seconds * 1000));
    void piSettings.patch({ retry: { enabled: piSettings.retryEnabled, maxRetries: piSettings.retryMaxRetries, baseDelayMs: ms, provider: { timeoutMs: null, maxRetries: 0, maxRetryDelayMs: 60000 } } });
  }

  function pickSteeringMode(value: string) {
    void piSettings.patch({ steeringMode: value as PiSettings["steeringMode"] });
  }

  function pickFollowUpMode(value: string) {
    void piSettings.patch({ followUpMode: value as PiSettings["followUpMode"] });
  }

  function toggleAutoUpdateExtensions() {
    void piSettings.patch({ autoUpdateExtensions: !piSettings.autoUpdateExtensions });
  }

  function toggleInsomnia() {
    void piSettings.patch({ insomnia: !piSettings.insomnia });
  }

  let updatingExtensions = $state(false);
  async function updateExtensionsNow() {
    if (updatingExtensions) return;
    updatingExtensions = true;
    try {
      await api.invoke("app:updateExtensions");
    } finally {
      updatingExtensions = false;
    }
  }

  function pickCavemanLevel(value: string) {
    void caveman.setLevel(value);
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

    <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-6 py-6">
      <div class="mx-auto flex max-w-xl flex-col gap-4">
        {#if !anyMatch}
          <p class="text-center text-xs text-fainter" data-testid="settings-search-empty">
            No settings match “{query.trim()}”.
          </p>
        {/if}

        {#if hit("providers")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="providers" use:sectionAction={"providers"}>
          <ProvidersSection />
        </section>
        {/if}

        {#if hit("playroom")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="playroom" use:sectionAction={"playroom"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Appearance Playroom</h2>
              <p class="text-xs text-faint">A live, isolated stage for tuning how the app looks and feels — send messages, mark done, fire alerts.</p>
            </div>
            <button
              class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg transition-colors hover:bg-surface-3"
              onclick={onOpenPlayroom}
              data-testid="settings-open-playroom"
            >Open</button>
          </div>
        </section>
        {/if}

        {#if hit("theme")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="theme" use:sectionAction={"theme"}>
          <ThemeControls />
        </section>
        {/if}

        {#if hit("composer")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="composer" use:sectionAction={"composer"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Composer</h2>
              <p class="text-xs text-faint">Light (silver) or dark (anodized) chassis. Auto follows your theme.</p>
            </div>
            <Select
              class="rounded-md bg-surface-2"
              value={theme.composer}
              onValueChange={(v) => theme.setComposer(v as ComposerStyle)}
              items={theme.composerOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
              data-testid="composer-style-select"
              aria-label="Composer appearance"
            />
          </div>
        </section>
        {/if}

        {#if hit("sidebar")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="sidebar" use:sectionAction={"sidebar"}>
          <div class="mb-3">
            <h2 class="text-sm text-fg">Sidebar engraving</h2>
            <p class="text-xs text-faint">Tune the sidebar metal surface and letterpress text. Values override sidebar-device.css in real time.</p>
          </div>
          <div class="grid grid-cols-2 gap-x-6 gap-y-3">
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Gradient angle: {engrave.angle}°</span>
              <input type="range" class="accent-primary" min="0" max="90" step="1" bind:value={engrave.angle} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Metal left L: {engrave.metalL.toFixed(3)}</span>
              <input type="range" class="accent-primary" min="0.5" max="0.95" step="0.005" bind:value={engrave.metalL} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Metal right L: {engrave.metalR.toFixed(3)}</span>
              <input type="range" class="accent-primary" min="0.6" max="0.98" step="0.005" bind:value={engrave.metalR} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Lip size: {engrave.lipPx}px</span>
              <input type="range" class="accent-primary" min="0" max="6" step="0.5" bind:value={engrave.lipPx} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Lip opacity: {engrave.lipOp.toFixed(2)}</span>
              <input type="range" class="accent-primary" min="0" max="1" step="0.05" bind:value={engrave.lipOp} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Ink lightness: {engrave.inkL.toFixed(3)}</span>
              <input type="range" class="accent-primary" min="0.08" max="0.55" step="0.005" bind:value={engrave.inkL} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Ink chroma: {engrave.inkC.toFixed(3)}</span>
              <input type="range" class="accent-primary" min="0" max="0.08" step="0.001" bind:value={engrave.inkC} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[11px] text-fainter">Ink hue: {engrave.inkH.toFixed(0)}°</span>
              <input type="range" class="accent-primary" min="0" max="360" step="1" bind:value={engrave.inkH} />
            </label>
          </div>
        </section>
        {/if}

        {#if hit("caveman")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="caveman" use:sectionAction={"caveman"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Caveman intensity</h2>
              <p class="text-xs text-faint">Level the composer caveman toggle maps to when on.</p>
            </div>
            <Select
              class="rounded-md bg-surface-2"
              value={caveman.level}
              onValueChange={pickCavemanLevel}
              items={[
                { value: "full", label: "Full" },
                { value: "ultra", label: "Ultra" },
              ]}
              data-testid="caveman-level-select"
              aria-label="Caveman intensity"
            />
          </div>
        </section>
        {/if}

        {#if hit("hud")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="hud" use:sectionAction={"hud"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">HUD auto-reveal</h2>
              <p class="text-xs text-faint">Expand the HUD chat when its own thread finishes.</p>
            </div>
            <input
              type="checkbox"
              checked={hudAutoReveal}
              onchange={(e) => api.invoke("hud:setAutoReveal", e.currentTarget.checked)}
              data-testid="settings-hud-auto-reveal"
            />
          </div>
        </section>
        {/if}

        {#if hit("doneAnimation")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="doneAnimation" use:sectionAction={"doneAnimation"}>
          <div class="mb-3">
            <h2 class="text-sm text-fg">Done animation</h2>
            <p class="text-xs text-faint">Pick the "mark Done" card animation. Press Play to preview each.</p>
          </div>
          <DoneBurstPlayground />
        </section>
        {/if}

        {#if hit("loaders")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="loaders" use:sectionAction={"loaders"}>
          <div class="mb-3">
            <h2 class="text-sm text-fg">Dot matrix loaders</h2>
            <p class="text-xs text-faint">
              Curate which spinners appear where. Square → chat, Hex → sidebar, Triangle → agents.
              A random loader from the selected set is picked each time one appears.
            </p>
          </div>
          <DotMatrixPlayground />
        </section>
        {/if}

        {#if hit("streaming")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="streaming" use:sectionAction={"streaming"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Streaming text</h2>
              <p class="text-xs text-faint">How assistant replies reveal as they stream in.</p>
            </div>
            <div class="flex flex-col items-end gap-2">
              <Select
                class="rounded-md bg-surface-2"
                value={streamReveal.look}
                onValueChange={(v) => streamReveal.setLook(v as StreamLook)}
                items={STREAM_LOOKS.map((l) => ({ value: l.id, label: l.label }))}
                data-testid="stream-look-select"
                aria-label="Reveal look"
              />
              <Select
                class="rounded-md bg-surface-2"
                value={streamReveal.speed}
                onValueChange={(v) => streamReveal.setSpeed(v as StreamSpeed)}
                items={STREAM_SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
                data-testid="stream-speed-select"
                aria-label="Reveal speed"
              />
            </div>
          </div>
        </section>
        {/if}

        {#if hit("sounds")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="sounds" use:sectionAction={"sounds"}>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm text-fg">Sounds</h2>
              <p class="text-xs text-faint">Button clicks and the done chime.</p>
            </div>
            <Switch
              checked={!muted}
              onCheckedChange={toggleSounds}
              data-testid="sounds-toggle"
              aria-label="Toggle sounds"
            />
          </div>
        </section>
        {/if}

        {#if hit("doneChime")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="doneChime" use:sectionAction={"doneChime"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Done chime</h2>
              <p class="text-xs text-faint">Pick a celebration cue for when a thread finishes, then preview it.</p>
            </div>
            <div class="flex items-center gap-2">
              <Select
                class="rounded-md bg-surface-2"
                value={doneVariant}
                onValueChange={pickDoneVariant}
                items={DONE_SOUND_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                data-testid="done-sound-select"
                aria-label="Done chime"
              />
              <button
                class="settings-btn rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
                onclick={previewDone}
                disabled={muted}
                data-testid="done-sound-preview"
              >Play</button>
            </div>
          </div>
          <p class="mt-2 text-xs text-fainter">
            {DONE_SOUND_OPTIONS.find((o) => o.id === doneVariant)?.description}
          </p>
        </section>
        {/if}

        {#if hit("threadDoneSound")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="threadDoneSound" use:sectionAction={"threadDoneSound"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Thread done sound</h2>
              <p class="text-xs text-faint">The cue played when you mark a thread done (the archive action).</p>
            </div>
            <div class="flex items-center gap-2">
              <Select
                class="rounded-md bg-surface-2"
                value={archiveVariant}
                onValueChange={pickArchiveVariant}
                items={DONE_SOUND_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                data-testid="archive-sound-select"
                aria-label="Thread done sound"
              />
              <button
                class="settings-btn rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
                onclick={previewArchive}
                disabled={muted}
                data-testid="archive-sound-preview"
              >Play</button>
            </div>
          </div>
          <p class="mt-2 text-xs text-fainter">
            {DONE_SOUND_OPTIONS.find((o) => o.id === archiveVariant)?.description}
          </p>
        </section>
        {/if}

        {#if hit("testBenchSound")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="testBenchSound" use:sectionAction={"testBenchSound"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Test bench sound</h2>
              <p class="text-xs text-faint">The cue played when you mark a thread for testing (the Eye action).</p>
            </div>
            <div class="flex items-center gap-2">
              <Select
                class="rounded-md bg-surface-2"
                value={testVariant}
                onValueChange={pickTestVariant}
                items={TEST_SOUND_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                data-testid="test-sound-select"
                aria-label="Test bench sound"
              />
              <button
                class="settings-btn rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
                onclick={previewTest}
                disabled={muted}
                data-testid="test-sound-preview"
              >Play</button>
            </div>
          </div>
          <p class="mt-2 text-xs text-fainter">
            {TEST_SOUND_OPTIONS.find((o) => o.id === testVariant)?.description}
          </p>
        </section>
        {/if}

        {#if hit("testAnimation")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="testAnimation" use:sectionAction={"testAnimation"}>
          <div class="mb-3">
            <h2 class="text-sm text-fg">Test bench animation</h2>
            <p class="text-xs text-faint">The "mark to test" card animation. Press Play to preview. (Sound plays too.)</p>
          </div>
          <TestBurstPlayground />
        </section>
        {/if}

        {#if hit("autoCompact")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="autoCompact" use:sectionAction={"autoCompact"}>
          <div>
            <h2 class="text-sm text-fg">Auto-compaction</h2>
            <p class="text-xs text-faint">
              Conversations compact automatically once context usage crosses either
              threshold — whichever is reached first. Leave the token cap blank to
              trigger on percentage alone.
            </p>
          </div>
          <div class="mt-3 flex flex-col gap-3">
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Context used (%)</span>
              <input
                type="number"
                min="1"
                max="100"
                value={autoCompact.percent}
                onchange={saveAutoCompactPercent}
                class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
                data-testid="auto-compact-percent"
                aria-label="Auto-compact percentage"
              />
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Token count</span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="none"
                value={autoCompact.tokens ?? ""}
                onchange={saveAutoCompactTokens}
                class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
                data-testid="auto-compact-tokens"
                aria-label="Auto-compact token count"
              />
            </label>
          </div>
        </section>
        {/if}

        {#if hit("retry")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="retry" use:sectionAction={"retry"}>
          <div>
            <h2 class="text-sm text-fg">Retry on error</h2>
            <p class="text-xs text-faint">
              When a request fails (network drop, transient error), pi retries with
              exponential backoff — each wait doubles.
            </p>
          </div>
          <div class="mt-3 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-fg">Enabled</span>
              <Switch
                checked={piSettings.retryEnabled}
                onCheckedChange={toggleRetryEnabled}
                data-testid="retry-enabled-toggle"
                aria-label="Toggle retry"
              />
            </div>
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Retries</span>
              <input
                type="number"
                min="0"
                max="10"
                value={piSettings.retryMaxRetries}
                onchange={saveRetryCount}
                class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
                data-testid="retry-count"
                aria-label="Number of retries"
              />
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Initial wait (seconds)</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={piSettings.retryBaseDelayMs / 1000}
                onchange={saveRetryDelay}
                class="settings-input w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
                data-testid="retry-initial-delay"
                aria-label="Initial wait seconds"
              />
            </label>
            {#if piSettings.retryMaxRetries > 0}
              <div class="rounded-md bg-surface-2 px-3 py-2 text-xs text-faint">
                <span class="text-fg-soft">Total retry window:</span>
                {formatDuration(retryTotalSeconds)}
                <span class="text-faint">
                  ({piSettings.retryMaxRetries} retries,
                  {piSettings.retryBaseDelayMs / 1000}s → {piSettings.retryBaseDelayMs / 1000 * Math.pow(2, piSettings.retryMaxRetries - 1)}s)
                </span>
              </div>
            {/if}
          </div>
        </section>
        {/if}

        {#if hit("messageDelivery")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="messageDelivery" use:sectionAction={"messageDelivery"}>
          <div>
            <h2 class="text-sm text-fg">Message delivery</h2>
            <p class="text-xs text-faint">How steering and follow-up messages are sent.</p>
          </div>
          <div class="mt-3 flex flex-col gap-3">
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Steering mode</span>
              <Select
                class="rounded-md bg-surface-2"
                value={piSettings.steeringMode}
                onValueChange={pickSteeringMode}
                items={[
                  { value: "one-at-a-time", label: "One at a time" },
                  { value: "all", label: "All" },
                ]}
                data-testid="steering-mode-select"
                aria-label="Steering mode"
              />
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs text-fg">Follow-up mode</span>
              <Select
                class="rounded-md bg-surface-2"
                value={piSettings.followUpMode}
                onValueChange={pickFollowUpMode}
                items={[
                  { value: "one-at-a-time", label: "One at a time" },
                  { value: "all", label: "All" },
                ]}
                data-testid="followup-mode-select"
                aria-label="Follow-up mode"
              />
            </label>
          </div>
        </section>
        {/if}

        {#if hit("extensions")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="extensions" use:sectionAction={"extensions"}>
          <div>
            <h2 class="text-sm text-fg">Extensions</h2>
            <p class="text-xs text-faint">
              Keep installed pi packages up to date by running
              <code>pi update --extensions</code> on launch and periodically. Runs
              only while no thread is active; restart to load new versions.
            </p>
          </div>
          <div class="mt-3 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-fg">Auto-update</span>
              <Switch
                checked={piSettings.autoUpdateExtensions}
                onCheckedChange={toggleAutoUpdateExtensions}
                data-testid="auto-update-extensions-toggle"
                aria-label="Toggle extension auto-update"
              />
            </div>
            <button
              class="settings-btn self-start rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
              onclick={updateExtensionsNow}
              disabled={updatingExtensions}
              data-testid="update-extensions-now"
            >
              {updatingExtensions ? "Updating…" : "Update now"}
            </button>
          </div>
        </section>
        {/if}

        {#if hit("insomnia")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="insomnia" use:sectionAction={"insomnia"}>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm text-fg">Keep awake while running</h2>
              <p class="text-xs text-faint">
                Prevent macOS idle sleep while an agent run is active. Releases the
                moment the run goes idle. Mac only.
              </p>
            </div>
            <Switch
              checked={piSettings.insomnia}
              onCheckedChange={toggleInsomnia}
              data-testid="insomnia-toggle"
              aria-label="Toggle keep awake"
            />
          </div>
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

        {#if hit("utilityModel")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="utilityModel" use:sectionAction={"utilityModel"}>
          <div>
            <h2 class="text-sm text-fg">Utility model</h2>
            <p class="text-xs text-faint">
              Background tasks like thread titles and commit messages use this fast,
              inexpensive model. Choose from your scoped models (same as the
              composer). Leave on “Default” to auto-pick.
            </p>
          </div>
          <Select
            class="mt-3 w-full rounded-md bg-surface-2"
            value={selectedKey}
            onValueChange={pickUtilityModel}
            items={[
              { value: "", label: "Default (auto-pick)" },
              ...grouped.flatMap((group) =>
                group.items.map((m) => ({ value: keyOf(m), label: m.name, group: group.provider })),
              ),
            ]}
            data-testid="utility-model-select"
            aria-label="Utility model"
          />
        </section>
        {/if}

        {#if hit("scopedModels")}
        <section bind:this={scopedModelsSection} class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="scopedModels" data-testid="scoped-models-section" use:sectionAction={"scopedModels"}>
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h2 class="text-sm text-fg">Scoped models</h2>
              <p class="text-xs text-faint">
                Which models appear in the composer selector. Shared with
                <code>pi /model</code> in <code>settings.json</code>.
              </p>
            </div>
            <ModelScopeSelect bind:open={scopedModelsOpen} class="min-w-44" />
          </div>
        </section>
        {/if}

        {#if hit("visionProxy")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="visionProxy" use:sectionAction={"visionProxy"}>
          <div class="mb-2">
            <h2 class="text-sm text-fg">Vision proxy</h2>
            <p class="text-xs text-faint">
              Routes images to a vision-capable model, collects descriptions, and
              injects them into the agent's context — so text-only models can
              "see" your images across turns. Requires restart after install.
            </p>
          </div>

          {#if !visionProxy.installed}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-faint">
                Not installed. Installs <code>npm:pi-vision-proxy</code> via pi.
              </span>
              <button
                class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
                onclick={installVisionProxy}
                disabled={installingVision}
                data-testid="install-vision-proxy"
              >
                {installingVision ? "Installing…" : "Install"}
              </button>
            </div>
            {#if visionError}
              <p class="mt-2 text-xs text-danger" data-testid="vision-proxy-error" use:clickCopy={visionError}>{visionError}</p>
            {/if}
          {:else}
            <div class="flex flex-col gap-3">
              <div>
                <label class="mb-1 block text-xs text-fg">Vision model</label>
                <Select
                  class="w-full rounded-md bg-surface-2"
                  value={visionKey}
                  onValueChange={pickVisionModel}
                  disabled={visionProxy.modelLocked}
                  items={grouped.flatMap((group) =>
                    group.items.map((m) => ({ value: keyOf(m), label: m.name, group: group.provider })),
                  )}
                  data-testid="vision-model-select"
                  aria-label="Vision model"
                />
                {#if visionProxy.modelLocked}
                  <p class="mt-1 text-[11px] text-fainter">
                    Locked by <code>PI_VISION_PROXY_MODEL</code> env var.
                  </p>
                {/if}
              </div>
              <div>
                <label class="mb-1 block text-xs text-fg">Mode</label>
                <Select
                  class="w-full rounded-md bg-surface-2"
                  value={visionProxy.mode}
                  onValueChange={(v) => visionProxy.setMode(v as VisionProxyConfig["mode"])}
                  disabled={visionProxy.modeLocked}
                  items={[
                    { value: "fallback", label: "Fallback — only when active model can't see images" },
                    { value: "always", label: "Always — always route through the proxy" },
                    { value: "off", label: "Off — disabled" },
                  ]}
                  data-testid="vision-mode-select"
                  aria-label="Vision proxy mode"
                />
                {#if visionProxy.modeLocked}
                  <p class="mt-1 text-[11px] text-fainter">
                    Locked by <code>PI_VISION_PROXY_MODE</code> env var.
                  </p>
                {/if}
              </div>
              {#if visionError}
                <p class="text-xs text-danger" data-testid="vision-proxy-error" use:clickCopy={visionError}>{visionError}</p>
              {/if}
            </div>
          {/if}
        </section>
        {/if}

        {#if hit("computerUse")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="computerUse" data-testid="computer-use-section" use:sectionAction={"computerUse"}>
          <div class="mb-3">
            <h2 class="text-sm text-fg">Computer use</h2>
            <p class="text-xs text-faint">
              Lets the agent drive real apps when no CLI/API path exists. Web pages
              use the native <code>agent_browser</code> tool; native macOS apps use
              the <code>cua-driver</code> (background, no focus steal). Run the
              checks below to install + grant access.
            </p>
          </div>

          <div class="flex flex-col gap-3">
            <!-- 1. agent-browser engine binary -->
            <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
              <div class="min-w-0">
                <p class="text-xs text-fg">agent-browser engine</p>
                <p class="text-[11px] text-fainter">
                  {#if agentBrowser?.binaryVersion}
                    <code>agent-browser {agentBrowser.binaryVersion}</code> found on PATH
                  {:else}
                    Binary not on PATH — install with <code>npm i -g agent-browser</code>
                  {/if}
                </p>
              </div>
              {#if agentBrowser?.binaryVersion}
                <Check size={16} class="text-emerald-500" />
              {:else}
                <CircleSlash size={16} class="text-fainter" />
              {/if}
            </div>

            <!-- 2. pi-agent-browser-native package -->
            <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="text-xs text-fg">Native <code>agent_browser</code> tool</p>
                <p class="text-[11px] text-fainter">
                  {#if agentBrowser?.installed}
                    <code>npm:pi-agent-browser-native</code> installed — restart pi to load
                  {:else}
                    Not installed — exposes the typed browser tool
                  {/if}
                </p>
              </div>
              {#if agentBrowser?.installed}
                <Check size={16} class="text-emerald-500" />
              {:else}
                <button
                  class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
                  onclick={installAgentBrowser}
                  disabled={installingBrowser}
                  data-testid="install-agent-browser"
                >
                  {installingBrowser ? "Installing…" : "Install"}
                </button>
              {/if}
            </div>

            <!-- 3. CuaDriver.app -->
            <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
              <div class="min-w-0">
                <p class="text-xs text-fg">Cua Driver</p>
                <p class="text-[11px] text-fainter">
                  {#if cuaDriver?.installed}
                    <code>CuaDriver.app{cuaDriver.version ? " v" + cuaDriver.version : ""}</code> installed
                  {:else}
                    Not installed — native macOS desktop automation
                  {/if}
                </p>
              </div>
              {#if cuaDriver?.installed}
                <Check size={16} class="text-emerald-500" />
              {:else}
                <CircleSlash size={16} class="text-fainter" />
              {/if}
            </div>

            <!-- 4. Cua Driver permissions -->
            <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="text-xs text-fg">macOS Accessibility + Screen Recording</p>
                <p class="text-[11px] text-fainter">
                  {#if cuaDriver?.installed}
                    {#if cuaDriver.accessibility === "granted" && cuaDriver.screenRecording === "granted"}
                      Both permissions granted
                    {:else if cuaDriver.accessibility === "unknown" || cuaDriver.screenRecording === "unknown"}
                      Start the Cua Driver daemon, then grant access
                    {:else}
                      Denied — re-enable in System Settings → Privacy & Security
                    {/if}
                  {:else}
                    Install Cua Driver first
                  {/if}
                </p>
              </div>
              {#if cuaDriver?.accessibility === "granted" && cuaDriver.screenRecording === "granted"}
                <Check size={16} class="text-emerald-500" />
              {:else}
                <button
                  class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
                  onclick={grantCuaPermissions}
                  disabled={grantingCua || !cuaDriver?.installed}
                  data-testid="grant-cua-permissions"
                >
                  {grantingCua ? "Opening…" : "Grant access"}
                </button>
              {/if}
            </div>

            {#if computerUseReady}
              <p class="text-xs text-emerald-500" data-testid="computer-use-ready">
                ✓ Computer use is set up. The agent will prefer programmatic paths,
                then <code>agent_browser</code> for web, then <code>cua-driver</code> for native desktop.
              </p>
            {:else}
              <p class="text-xs text-faint">
                Computer use is optional. The agent prefers CLI/API/connector paths; it only
                drives UI when no programmatic route exists.
              </p>
            {/if}
          </div>
        </section>
        {/if}

        {#if hit("about")}
        <section class="settings-section rounded-lg border border-border bg-surface/50 p-4" data-settings-section="about" use:sectionAction={"about"}>
          <h2 class="text-sm text-fg">About</h2>
          <p class="mt-1 text-xs text-faint">peach-pi {version}</p>
        </section>
        {/if}
      </div>
    </div>
  </div>
</main>

<style>
  /* In-page settings sidebar — local to this view. */
  .settings-nav {
    border-right: 1px solid var(--color-border);
  }
  .settings-nav-item.is-active {
    background: var(--color-surface-2);
    color: var(--color-fg);
    font-weight: 500;
    box-shadow: inset 2px 0 0 0 var(--color-accent);
  }
  .settings-section {
    scroll-margin-top: 1rem;
  }
</style>
