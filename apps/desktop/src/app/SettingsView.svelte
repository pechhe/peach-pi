<script lang="ts">
  import { onMount } from "svelte";
  import { setSoundsMuted, soundsMuted } from "../lib/sound/sound-prefs";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import { api } from "../lib/ipc";

  let muted = $state(soundsMuted());
  let version = $state("");

  onMount(async () => {
    version = (await api.invoke("app:ping")).version;
  });

  function toggleSounds() {
    muted = !muted;
    setSoundsMuted(muted);
    if (!muted) playButtonClick("click");
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="settings-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
    <h1 class="text-sm font-medium text-zinc-300">Settings</h1>
  </header>
  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-xl flex-col gap-4">
      <section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm text-zinc-200">Sounds</h2>
            <p class="text-xs text-zinc-500">Button clicks and the done chime.</p>
          </div>
          <button
            class="relative h-5 w-9 rounded-full transition-colors {muted ? 'bg-zinc-700' : 'bg-emerald-600'}"
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

      <section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 class="text-sm text-zinc-200">About</h2>
        <p class="mt-1 text-xs text-zinc-500">peach-pi {version}</p>
      </section>
    </div>
  </div>
</main>
