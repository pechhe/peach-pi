<script lang="ts">
  import type { TopbarSettings } from "@peach-pi/shared-types";
  import { piSettings } from "../stores/pi-settings.svelte";
  import Activity from "@lucide/svelte/icons/activity";
  import ScanLine from "@lucide/svelte/icons/scan-line";

  // Local mutable copy of the toggle state; persisted on every change.
  // Reading from piSettings.topbar keeps us in sync with the main process.
  let local = $state<TopbarSettings>({ ...piSettings.topbar });

  function toggle(key: keyof TopbarSettings): void {
    local = { ...local, [key]: !local[key] };
    piSettings.patch({ topbar: local });
  }
</script>

<section
  class="settings-section rounded-lg border border-border bg-surface/50 p-4"
  data-settings-section="topbar"
>
  <header class="mb-3 flex items-center gap-2">
    <ScanLine size={14} />
    <h2 class="text-sm text-fg">Topbar</h2>
  </header>
  <p class="mb-4 text-xs text-muted">
    Choose which optional widgets appear in the thread topbar. More
    customization coming soon.
  </p>

  <!-- Mini topbar mockup — mirrors the real ThreadView topbar layout. -->
  <div
    class="mb-4 flex items-center gap-1 rounded-md border border-border-strong bg-bg/60 px-2 py-1.5"
    data-testid="topbar-mockup"
  >
    <span class="rounded px-1.5 py-0.5 font-mono text-[10px] text-faint">&gt;_</span>
    <span class="ml-1 text-[10px] text-faint">Git</span>

    <div class="ml-auto flex items-center gap-1">
      <label class="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] {local.devtap ? 'text-muted' : 'text-faint opacity-50 line-through'}">
        <input type="checkbox" class="sr-only" checked={local.devtap} onchange={() => toggle("devtap")} />
        <Activity size={11} /> DevTap
      </label>
      <label class="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] {local.fallow ? 'text-muted' : 'text-faint opacity-50 line-through'}">
        <input type="checkbox" class="sr-only" checked={local.fallow} onchange={() => toggle("fallow")} />
        <ScanLine size={11} /> Fallow
      </label>
    </div>
  </div>
  <p class="text-[10px] text-fainter">
    Struck-through chips are hidden in the real topbar.
  </p>
</section>
