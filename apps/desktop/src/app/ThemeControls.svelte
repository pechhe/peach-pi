<script lang="ts">
  /**
   * Theme editor: mode switch (single / system / rotate) + a visual palette
   * grid (ThemeGrid), plus the custom-color editor for the working draft and
   * saved themes. Extracted from SettingsView; also hosted in the Playroom.
   */
  import {
    THEMES,
    PRIMARY_SLOTS,
    STATUS_SLOTS,
    DEVICE_SLOTS,
    CUSTOM_THEME_ID,
    isSavedId,
    isValidThemeName,
    theme,
    type CustomPrimaries,
    type ThemeMode,
  } from "../lib/theme.svelte";
  import { Select } from "../components/ui/select";
  import ThemeGrid from "./ThemeGrid.svelte";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Shuffle from "@lucide/svelte/icons/shuffle";

  // Inline name field for save / rename. `showNameField` gates the row;
  // `nameDraft` is just the text the user is typing.
  let nameDraft = $state("");
  let showNameField = $state(false);
  let nameInput = $state<HTMLInputElement | null>(null);

  const MODE_OPTIONS: { id: ThemeMode; label: string; hint: string }[] = [
    { id: "single", label: "Single", hint: "One theme, always." },
    { id: "system", label: "Match system", hint: "Light theme + dark theme; follows your OS." },
    { id: "rotate", label: "Surprise me", hint: "Random light + dark theme each day." },
  ];

  /** True when the color editor should render (custom draft or a saved theme). */
  const editing = $derived(
    theme.current === CUSTOM_THEME_ID || isSavedId(theme.current),
  );
  /** Primaries bound to the swatches: the active saved theme's, or the draft. */
  const activePrimaries = $derived(
    isSavedId(theme.current)
      ? (theme.savedThemes.find((t) => t.id === theme.current)?.primaries ?? {})
      : theme.customPrimaries,
  );
  /** Name of the active saved theme ("" for the draft). */
  const activeName = $derived(
    isSavedId(theme.current)
      ? (theme.savedThemes.find((t) => t.id === theme.current)?.name ?? "")
      : "",
  );
</script>

<div class="space-y-4">
  <!-- Mode switch -->
  <div>
    <h2 class="text-sm text-fg">Theme</h2>
    <p class="text-xs text-faint">
      {#each MODE_OPTIONS as opt, i}{#if i} · {/if}{#if theme.prefs.mode === opt.id}{opt.hint}{/if}{/each}
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Theme mode">
      {#each MODE_OPTIONS as opt}
        <button
          type="button"
          role="tab"
          aria-selected={theme.prefs.mode === opt.id}
          class="rounded-md px-3 py-1.5 text-xs transition-colors"
          class:bg-surface-3={theme.prefs.mode === opt.id}
          class:text-fg={theme.prefs.mode === opt.id}
          class:bg-surface-2={theme.prefs.mode !== opt.id}
          class:text-muted={theme.prefs.mode !== opt.id}
          class:hover:text-fg={theme.prefs.mode !== opt.id}
          onclick={() => theme.setMode(opt.id)}
          data-testid={`theme-mode-${opt.id}`}
        >{opt.label}</button>
      {/each}
    </div>
  </div>

  <!-- Visual grid (selection semantics depend on the mode) -->
  <div>
    {#if theme.prefs.mode === "rotate"}
      <div class="mb-2 flex items-center justify-between">
        <div>
          <h3 class="text-xs font-medium text-fg-soft">Rotation pool</h3>
          <p class="text-xs text-faint">Check themes to add them to the daily roll. Empty pools keep the defaults.</p>
        </div>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-border-focus hover:text-fg"
          onclick={() => theme.rerotate()}
          data-testid="theme-reroll"
          title="Reroll the current picks"
        >
          <Shuffle class="size-3.5" />
          Reroll
        </button>
      </div>
    {:else if theme.prefs.mode === "system"}
      <div class="mb-2 flex items-center gap-6 text-xs text-muted">
        <span><span class="font-medium text-fg-soft">Light:</span> {THEMES.find((t) => t.id === theme.prefs.systemLight)?.label ?? theme.prefs.systemLight}</span>
        <span><span class="font-medium text-fg-soft">Dark:</span> {THEMES.find((t) => t.id === theme.prefs.systemDark)?.label ?? theme.prefs.systemDark}</span>
      </div>
    {/if}
    <ThemeGrid />
  </div>

  <!-- Custom editor: only when the active theme is the draft or a saved one -->
  {#if editing}
  <div class="space-y-4 border-t border-border pt-4">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      <label class="flex items-center gap-2 text-xs text-muted">
        Base
        <Select
          class="rounded-md bg-surface-2"
          value={isSavedId(theme.current) ? (theme.savedThemes.find((t) => t.id === theme.current)?.scheme ?? "dark") : theme.customScheme}
          onValueChange={(v) => theme.setCustomScheme(v as "dark" | "light")}
          items={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          data-testid="custom-scheme-select"
          aria-label="Theme base"
        />
      </label>

      {#if isSavedId(theme.current)}
        <button
          type="button"
          class="ml-auto rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          onclick={() => { showNameField = true; nameDraft = activeName; requestAnimationFrame(() => nameInput?.select()); }}
          data-testid="theme-rename"
        >Rename</button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-danger transition-colors hover:bg-danger-surface hover:text-danger"
          onclick={() => theme.deleteSaved(theme.current)}
          data-testid="theme-delete"
        >Delete</button>
      {:else}
        <button
          type="button"
          class="ml-auto rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-border-focus hover:text-fg"
          onclick={() => { showNameField = true; nameDraft = ""; requestAnimationFrame(() => nameInput?.focus()); }}
          data-testid="theme-save"
        >Save as…</button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          onclick={() => theme.resetAll()}
          data-testid="custom-reset-all"
        >Reset to base</button>
      {/if}
    </div>

    {#if showNameField}
    <form
      class="flex items-center gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        if (!isValidThemeName(nameDraft)) return;
        if (isSavedId(theme.current)) {
          theme.renameActive(nameDraft);
        } else {
          theme.save(nameDraft);
        }
        showNameField = false;
        nameDraft = "";
      }}
    >
      <input
        bind:this={nameInput}
        type="text"
        class="w-48 rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none transition-colors focus:border-border-focus"
        placeholder="Theme name"
        bind:value={nameDraft}
        aria-label="Theme name"
        data-testid="theme-name"
      />
      <button
        type="submit"
        class="rounded-md bg-surface-2 px-3 py-1 text-xs text-fg transition-colors hover:bg-surface-3 disabled:opacity-40"
        disabled={!isValidThemeName(nameDraft)}
        data-testid="theme-name-confirm"
      >{isSavedId(theme.current) ? "Save" : "Create"}</button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs text-faint transition-colors hover:text-fg"
        onclick={() => { showNameField = false; nameDraft = ""; }}
      >Cancel</button>
    </form>
    {/if}

    <div class="flex flex-wrap gap-x-8 gap-y-3">
      {#each PRIMARY_SLOTS as slot (slot.id)}
        {@render primarySwatch({ slot, primaries: activePrimaries })}
      {/each}
      {#each STATUS_SLOTS as slot (slot.id)}
        {@render primarySwatch({ slot, primaries: activePrimaries })}
      {/each}
      {#each DEVICE_SLOTS as slot (slot.id)}
        {@render primarySwatch({ slot, primaries: activePrimaries })}
      {/each}
    </div>
    <p class="text-xs text-fainter">
      Surfaces, borders, and text shades are derived from your three colors. Warning and error each derive their own
      border and surface. Metal, screen, and screen text restyle the composer device. Active label recolours the
      lit sidebar nav item.
    </p>
  </div>
  {/if}
</div>

{#snippet primarySwatch({ slot, primaries }: { slot: { id: keyof CustomPrimaries; label: string; token?: string }; primaries: CustomPrimaries })}
  {@const value = primaries[slot.id] ?? ""}
  {@const token = slot.token ?? `--color-${slot.id}`}
  {@const swatchVar = value ? `var(${token})` : "transparent"}
  <div class="flex items-center gap-2">
    <label
      class="relative flex size-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border-strong"
      title={value || "Inherit from base"}
      style="background: {swatchVar};"
    >
      <input
        type="color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        value={value || "#000000"}
        oninput={(e) => theme.setPrimary(slot.id, e.currentTarget.value)}
        aria-label={`${slot.label} color`}
        data-testid={`primary-input-${slot.id}`}
      />
    </label>
    <span class="min-w-0 text-xs text-fg-soft">{slot.label}</span>
    {#if value}
      <button
        type="button"
        class="shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
        title="Inherit from base"
        aria-label="Inherit {slot.label} from base"
        onclick={() => theme.resetPrimary(slot.id)}
        data-testid={`primary-reset-${slot.id}`}
      >
        <RotateCcw class="size-3.5" />
      </button>
    {/if}
  </div>
{/snippet}
