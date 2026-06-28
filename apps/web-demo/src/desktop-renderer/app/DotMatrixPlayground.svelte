<script lang="ts">
  // Dot-matrix loader playground. Renders one tab per surface shape (Square =
  // chat, Hex = sidebar, Triangle = agents), showing every loader in that shape
  // as a still preview tile the user can toggle on/off. Tiles are static unless
  // hovered (so 20 previews don't run 20 animation loops and jank the menu).
  import { byShape, type LoaderShape } from "../components/ui/dot-matrix/registry.svelte";
  import { loaderPrefs } from "../lib/loader-prefs.svelte";
  import Check from "@lucide/svelte/icons/check";

  type Tab = { id: LoaderShape; label: string; surface: string };

  const TABS: readonly Tab[] = [
    { id: "square", label: "Square", surface: "Chat surface" },
    { id: "hex", label: "Hex", surface: "Sidebar" },
    { id: "triangle", label: "Triangle", surface: "Agents" },
  ];

  let active = $state<LoaderShape>("square");
  const entries = $derived(byShape(active));
  const selected = $derived(loaderPrefs.selection(active));

  // Only the hovered tile animates; everything else renders a still idle frame.
  let hovered = $state<string | null>(null);

  function isOn(id: string): boolean {
    return selected.includes(id);
  }
</script>

<div class="space-y-4">
  <!-- Shape tabs -->
  <div class="flex gap-1 rounded-md bg-surface-2 p-1">
    {#each TABS as tab (tab.id)}
      <button
        type="button"
        class="flex-1 rounded px-3 py-1.5 text-xs transition-colors {active === tab.id
          ? "bg-surface text-fg shadow-sm"
          : "text-faint hover:text-fg"}"
        onclick={() => (active = tab.id)}
      >
        {tab.label}
        <span class="ml-1 text-fainter">· {tab.surface}</span>
      </button>
    {/each}
  </div>

  <p class="text-xs text-faint">
    {selected.length} selected · the random spinner draws from these. Click a tile to toggle. Hover to animate.
  </p>

  <!-- Loader grid -->
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {#each entries as entry (entry.id)}
      {@const on = isOn(entry.id)}
      {@const Comp = entry.component}
      <button
        type="button"
        class="relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors {on
          ? 'border-accent/60 bg-accent/10'
          : 'border-border bg-surface/40 hover:border-border'}"
        onclick={() => loaderPrefs.toggle(active, entry.id)}
        onmouseenter={() => (hovered = entry.id)}
        onmouseleave={() => (hovered = null)}
        aria-pressed={on}
      >
        <!-- Still preview unless hovered; bloom off for perf -->
        <div class="flex h-10 items-center justify-center">
          <Comp size={32} dotSize={5} bloom={false} animated={hovered === entry.id} />
        </div>
        <span class="line-clamp-1 text-center text-[11px] text-fg">{entry.name}</span>
        <span class="text-[10px] text-fainter">{entry.id}</span>
        {#if on}
          <span class="absolute right-1.5 top-1.5 text-accent" aria-hidden="true">
            <Check size={13} />
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>
