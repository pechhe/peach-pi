<script lang="ts">
  import { onMount } from "svelte";
  import type { ModelInfo } from "@peach-pi/shared-types";
  import { setSoundsMuted, soundsMuted } from "../lib/sound/sound-prefs";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import { THEMES, theme } from "../lib/theme.svelte";
  import { api } from "../lib/ipc";

  let muted = $state(soundsMuted());
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

  onMount(async () => {
    version = (await api.invoke("app:ping")).version;
    [models, utilityModel] = await Promise.all([
      api.invoke("app:listModels"),
      api.invoke("app:getUtilityModel"),
    ]);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
  });

  function toggleSounds() {
    muted = !muted;
    setSoundsMuted(muted);
    if (!muted) playButtonClick("click");
  }

  async function pickUtilityModel(e: Event) {
    const key = (e.currentTarget as HTMLSelectElement).value;
    selectedKey = key;
    const model = key ? byKey.get(key) ?? null : null;
    utilityModel = await api.invoke("app:setUtilityModel", model);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
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
          <select
            class="rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
            value={theme.current}
            onchange={(e) => theme.set((e.currentTarget as HTMLSelectElement).value)}
            data-testid="theme-select"
            aria-label="Theme"
          >
            {#each THEMES as t (t.id)}
              <option value={t.id}>{t.label}</option>
            {/each}
          </select>
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
        <select
          class="mt-3 w-full rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-border-focus"
          value={selectedKey}
          onchange={pickUtilityModel}
          data-testid="utility-model-select"
          aria-label="Utility model"
        >
          <option value="">Default (auto-pick)</option>
          {#each grouped as group (group.provider)}
            <optgroup label={group.provider}>
              {#each group.items as m (keyOf(m))}
                <option value={keyOf(m)}>{m.name}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </section>
    </div>
  </div>
</main>
