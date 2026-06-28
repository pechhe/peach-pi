<script lang="ts">
  /**
   * Visual theme picker: a grid of swatch cards, one per preset (and saved
   * theme). Each card is wrapped in `.theme-scope[data-theme="…"]` so it
   * reads the live `var(--color-*)` palette directly from app.css — no
   * duplicated palette map to drift out of sync.
   *
   * Selection semantics depend on the active mode:
   *   single  → click selects; the active card shows a ring.
   *   system  → two rings possible (the light slot + the dark slot); click
   *             sets the slot matching the card's scheme.
   *   rotate  → checkbox toggle adds/removes the theme from its pool; the
   *             in-pool cards show a check; the currently-rolled active pick
   *             shows a ring.
   */
  import { THEMES, CUSTOM_THEME_ID, type SavedTheme, type Scheme, type ThemeMode } from "../lib/theme.svelte";
  import { theme } from "../lib/theme.svelte";
  import Check from "@lucide/svelte/icons/check";

  /** A unified card shape for presets + saved themes. `saved`/`imported` are
   *  only present on saved-theme cards; presets leave them absent. */
  interface ThemeCard {
    id: string;
    label: string;
    scheme: Scheme;
    saved?: true;
    imported?: boolean;
  }

  /** Cards derived from presets + saved themes, split by scheme. */
  let lightCards = $derived<ThemeCard[]>([
    ...THEMES.filter((t) => t.scheme === "light"),
    ...theme.savedThemes.filter((t) => t.scheme === "light").map(savedCard),
  ]);
  let darkCards = $derived<ThemeCard[]>([
    ...THEMES.filter((t) => t.scheme === "dark"),
    ...theme.savedThemes.filter((t) => t.scheme === "dark").map(savedCard),
  ]);

  function savedCard(t: SavedTheme): ThemeCard {
    return { id: t.id, label: t.name, scheme: t.scheme, saved: true as const, imported: t.source === "imported" };
  }

  /** The active theme ids per scheme, for ring display under each mode. */
  let activeLight = $derived(activeIdFor("light"));
  let activeDark = $derived(activeIdFor("dark"));

  function activeIdFor(scheme: Scheme): string {
    const p = theme.prefs;
    if (p.mode === "single") return theme.current;
    if (p.mode === "system") return scheme === "light" ? p.systemLight : p.systemDark;
    return scheme === "light" ? p.rotateActiveLight : p.rotateActiveDark;
  }

  /** Is a card in its scheme's rotation pool? */
  function inPool(id: string, scheme: Scheme): boolean {
    const pool = scheme === "light" ? theme.prefs.rotateLight : theme.prefs.rotateDark;
    return pool.includes(id);
  }

  /** Card click: mode-dependent. */
  function onCardClick(id: string, scheme: Scheme): void {
    const mode = theme.prefs.mode;
    if (mode === "single") {
      theme.setSingle(id);
    } else if (mode === "system") {
      theme.setSystemSlot(scheme, id);
    } else {
      theme.toggleRotatePool(scheme, id);
    }
  }
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
  {#each [...darkCards, ...lightCards] as card (card.id)}
    {@const isActive = card.id === (card.scheme === "light" ? activeLight : activeDark)}
    {@const checked = theme.prefs.mode === "rotate" && inPool(card.id, card.scheme)}
    {@const showRing = isActive}
    <button
      type="button"
      class="theme-card group relative flex flex-col gap-2 overflow-hidden rounded-lg border p-2 text-left transition-all"
      class:ring-2={showRing}
      class:ring-offset-2={showRing}
      class:opacity-70={theme.prefs.mode === "rotate" && !checked && !isActive}
      style="border-color: var(--color-border-strong);"
      onclick={() => onCardClick(card.id, card.scheme)}
      aria-pressed={isActive}
      data-testid={`theme-card-${card.id}`}
    >
      <!-- Scoped so the inner divs resolve the card's own palette tokens. -->
      <div
        class="theme-scope pointer-events-none grid grid-cols-4 gap-1 rounded"
        data-theme={card.id}
        style="aspect-ratio: 2 / 1;"
      >
        <div class="rounded-sm" style="background: var(--color-bg);"></div>
        <div class="rounded-sm" style="background: var(--color-surface-3);"></div>
        <div class="rounded-sm" style="background: var(--color-accent);"></div>
        <div class="rounded-sm" style="background: var(--color-primary);"></div>
        <div class="col-span-2 rounded-sm" style="background: var(--color-surface-2);"></div>
        <div class="rounded-sm" style="background: var(--color-fg);"></div>
        <div class="rounded-sm" style="background: var(--color-warning);"></div>
        <div class="col-span-2 rounded-sm" style="background: var(--color-surface); border-top: 1px solid var(--color-border);"></div>
        <div class="rounded-sm" style="background: var(--color-danger);"></div>
        <div class="rounded-sm" style="background: var(--color-success);"></div>
      </div>
      <div class="flex items-center justify-between gap-1">
        <span class="truncate text-xs font-medium" style="color: var(--color-fg);">{card.label}</span>
        <div class="flex items-center gap-1">
          {#if card.saved && card.imported}
            <span class="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide" style="background: var(--color-surface-3); color: var(--color-fg-soft);" title="Imported">Imported</span>
          {/if}
          {#if checked}
            <Check class="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          {/if}
        </div>
      </div>
      {#if showRing}
        <span class="sr-only">(active)</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  /* The ring + offset use the app's accent so it reads on any theme. */
  .theme-card.ring-2 {
    --tw-ring-color: var(--color-accent);
    --tw-ring-offset-color: var(--color-bg);
  }
  /* When not ringed, the card's own border + a subtle hover lift. */
  .theme-card:not(.ring-2):hover {
    transform: translateY(-1px);
  }
</style>
