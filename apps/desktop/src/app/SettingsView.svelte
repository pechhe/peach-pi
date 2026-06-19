<script lang="ts">
  import { onMount } from "svelte";
  import type { ModelInfo, PiSettings } from "@peach-pi/shared-types";
  import { setSoundsMuted, soundsMuted, setDoneSoundVariant, getDoneSoundVariant } from "../lib/sound/sound-prefs";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import { DONE_SOUND_OPTIONS, playDoneSound, type DoneSoundVariant } from "../lib/sound/done-sound";
  import { THEMES, theme, type ComposerStyle } from "../lib/theme.svelte";
  import {
    STREAM_LOOKS,
    STREAM_SPEEDS,
    streamReveal,
    type StreamLook,
    type StreamSpeed,
  } from "../lib/stream-reveal.svelte";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import DoneBurstPlayground from "./DoneBurstPlayground.svelte";
  import { autoCompact } from "../stores/auto-compact.svelte";
  import { caveman } from "../stores/caveman.svelte";
  import { piSettings } from "../stores/pi-settings.svelte";
  import { snapshot } from "../stores/snapshot.svelte";

  const hudAutoReveal = $derived(snapshot.current?.ui.hudAutoRevealOnFinish ?? false);

  let muted = $state(soundsMuted());
  let doneVariant = $state(getDoneSoundVariant() as DoneSoundVariant);
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

  async function pickUtilityModel(key: string) {
    selectedKey = key;
    const model = key ? byKey.get(key) ?? null : null;
    utilityModel = await api.invoke("app:setUtilityModel", model);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
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

  function pickCavemanLevel(value: string) {
    void caveman.setLevel(value);
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="settings-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
    <h1 class="text-sm font-medium text-fg-soft">Settings</h1>
  </header>
  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-xl flex-col gap-4">
      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-sm text-fg">Theme</h2>
            <p class="text-xs text-faint">Applies to every window.</p>
          </div>
          <Select
            class="rounded-md bg-surface-2"
            value={theme.current}
            onValueChange={(v) => theme.set(v)}
            items={THEMES.map((t) => ({ value: t.id, label: t.label }))}
            data-testid="theme-select"
            aria-label="Theme"
          />
        </div>
      </section>

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

      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <div class="mb-3">
          <h2 class="text-sm text-fg">Done animation</h2>
          <p class="text-xs text-faint">Pick the "mark Done" card animation. Press Play to preview each.</p>
        </div>
        <DoneBurstPlayground />
      </section>

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

      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm text-fg">Sounds</h2>
            <p class="text-xs text-faint">Button clicks and the done chime.</p>
          </div>
          <button
            class="relative h-5 w-9 rounded-full transition-colors {muted ? 'bg-surface-3' : 'bg-success'}"
            onclick={toggleSounds}
            data-testid="sounds-toggle"
            aria-label="Toggle sounds"
            role="switch"
            aria-checked={!muted}
          >
            <span
              class="absolute top-0.5 size-4 rounded-full bg-white transition-transform {muted
                ? 'translate-x-0.5'
                : 'translate-x-[1.1rem]'}"
            ></span>
          </button>
        </div>
      </section>

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
            <button
              class="relative h-5 w-9 rounded-full transition-colors {piSettings.retryEnabled ? 'bg-success' : 'bg-surface-3'}"
              onclick={toggleRetryEnabled}
              data-testid="retry-enabled-toggle"
              aria-label="Toggle retry"
              role="switch"
              aria-checked={piSettings.retryEnabled}
            >
              <span
                class="absolute top-0.5 size-4 rounded-full bg-white transition-transform {piSettings.retryEnabled
                  ? 'translate-x-[1.1rem]'
                  : 'translate-x-0.5'}"
              ></span>
            </button>
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

      <section class="rounded-lg border border-border bg-surface/50 p-4">
        <h2 class="text-sm text-fg">About</h2>
        <p class="mt-1 text-xs text-faint">peach-pi {version}</p>
      </section>

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
    </div>
  </div>
</main>
