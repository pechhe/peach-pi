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
  } from "../lib/sound/sound-prefs";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import {
    DONE_SOUND_OPTIONS,
    playDoneSound,
    playArchiveSound,
    type DoneSoundVariant,
  } from "../lib/sound/done-sound";
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
  import ThemeControls from "./ThemeControls.svelte";
  import SubagentsSection from "./SubagentsSection.svelte";
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

  /** Searchable keywords per section (title + description), lowercased. */
  const SECTION_KEYWORDS = {
    playroom: "appearance playroom live stage tune look feel messages done animation alerts chassis",
    theme: "theme appearance applies to every window colors",
    composer: "composer light silver dark anodized chassis auto follows your theme",
    caveman: "caveman intensity level composer toggle",
    hud: "hud auto-reveal expand chat thread finishes",
    doneAnimation: "done animation mark done card animation preview play",
    streaming: "streaming text assistant replies reveal stream",
    sounds: "sounds button clicks done chime mute",
    doneChime: "done chime celebration cue thread finishes preview",
    threadDoneSound: "thread done sound mark done archive click precision archive latch metallic preview",
    autoCompact: "auto-compaction compact context usage threshold tokens percentage",
    retry: "retry on error network drop transient exponential backoff wait doubles",
    messageDelivery: "message delivery steering mode follow-up mode",
    extensions: "extensions auto update packages pi update periodic refresh",
    insomnia: "insomnia sleep idle caffeinate prevent mac awake while running",
    about: "about peach-pi version",
    utilityModel: "utility model background tasks thread titles commit messages fast inexpensive",
    subagents:
      "subagents agents scouting research verification cheap model roster subagent roster",
    scopedModels:
      "scoped models scopedmodels enable disable model scope composer selector enabled models available list",
    computerUse:
      "computer use agent browser cua driver native desktop automation accessibility permissions install setup",
    visionProxy:
      "vision proxy images description describe blind text-only model fallback always off consent claude gemini qwen",
  } as const;

  let query = $state(initialQuery);
  let searchInput = $state<HTMLInputElement | null>(null);
  // Deep-link anchor for the theme section.
  let themeSection = $state<HTMLElement | null>(null);

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
      scopedModelsSection.scrollIntoView({ block: "center" });
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
  function hit(key: keyof typeof SECTION_KEYWORDS): boolean {
    return q === "" || SECTION_KEYWORDS[key].includes(q);
  }
  const anyMatch = $derived(q === "" || Object.values(SECTION_KEYWORDS).some((k) => k.includes(q)));

  let muted = $state(soundsMuted());
  let doneVariant = $state(getDoneSoundVariant() as DoneSoundVariant);
  let archiveVariant = $state(getArchiveSoundVariant() as DoneSoundVariant);
  let version = $state("");
  let models = $state<ModelInfo[]>([]);
  let utilityModel = $state<ModelInfo | null>(null);
  /** key: provider:id — for the <select> value. Empty string = use defaults. */
  let selectedKey = $state("");

  const keyOf = (m: { provider: string; id: string }) => `${m.provider}:${m.id}`;
  const byKey = $derived(new Map(models.map((m) => [keyOf(m), m])));
  const grouped = $derived.by(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = groups.get(m.provider);
      if (arr) arr.push(m);
      else groups.set(m.provider, [m]);
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

  async function pickUtilityModel(key: string) {
    selectedKey = key;
    const model = key ? byKey.get(key) ?? null : null;
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
  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-xl flex-col gap-4">
      {#if !anyMatch}
        <p class="text-center text-xs text-fainter" data-testid="settings-search-empty">
          No settings match “{query.trim()}”.
        </p>
      {/if}
      {#if hit("playroom")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-sm text-fg">Appearance Playroom</h2>
            <p class="text-xs text-faint">A live, isolated stage for tuning how the app looks and feels — send messages, mark done, fire alerts.</p>
          </div>
          <button
            class="rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg transition-colors hover:bg-surface-3"
            onclick={onOpenPlayroom}
            data-testid="settings-open-playroom"
          >Open</button>
        </div>
      </section>
      {/if}

      {#if hit("theme")}
      <section class="rounded-lg border border-border bg-surface/50 p-4" bind:this={themeSection}>
        <ThemeControls />
      </section>
      {/if}

      {#if hit("composer")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <div class="mb-3">
          <h2 class="text-sm text-fg">Done animation</h2>
          <p class="text-xs text-faint">Pick the "mark Done" card animation. Press Play to preview each.</p>
        </div>
        <DoneBurstPlayground />
      </section>
      {/if}

      {#if hit("streaming")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
              class="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
              class="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
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

      {#if hit("autoCompact")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
              class="w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
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
              class="w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
              data-testid="auto-compact-tokens"
              aria-label="Auto-compact token count"
            />
          </label>
        </div>
      </section>
      {/if}

      {#if hit("retry")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
              class="w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
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
              class="w-28 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
            class="self-start rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
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
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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

      {#if hit("subagents")}
      <section class="rounded-lg border border-border bg-surface/50 p-4" data-testid="subagents-section">
        <SubagentsSection projects={snapshot.current?.projects ?? []} />
      </section>
      {/if}

      {#if hit("about")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <h2 class="text-sm text-fg">About</h2>
        <p class="mt-1 text-xs text-faint">peach-pi {version}</p>
      </section>
      {/if}

      {#if hit("computerUse")}
      <section class="rounded-lg border border-border bg-surface/50 p-4" data-testid="computer-use-section">
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
                class="rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
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
                class="rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
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

      {#if hit("visionProxy")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
              class="rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
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

      {#if hit("scopedModels")}
      <section bind:this={scopedModelsSection} class="rounded-lg border border-border bg-surface/50 p-4" data-testid="scoped-models-section">
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

      {#if hit("utilityModel")}
      <section class="rounded-lg border border-border bg-surface/50 p-4">
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
    </div>
  </div>
</main>
