<script lang="ts">
  /**
   * Theme editor controls: preset/saved/custom select, light-dark base,
   * save / rename / delete, and the primary / status / device color swatches.
   * Extracted from SettingsView so the Appearance Playroom can host the same
   * editor beside its live stage. Purely drives the `theme` store; the live
   * repaint happens globally via the injected override <style>.
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
  } from "../lib/theme.svelte";
  import { Select } from "../components/ui/select";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  // Inline name field for save / rename. `showNameField` gates the row;
  // `nameDraft` is just the text the user is typing.
  let nameDraft = $state("");
  let showNameField = $state(false);
  let nameInput = $state<HTMLInputElement | null>(null);

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

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Theme</h2>
    <p class="text-xs text-faint">Pick a preset, or set your own core colors. Applies to every window.</p>
  </div>
  <Select
    class="rounded-md bg-surface-2"
    value={theme.current}
    onValueChange={(v) => {
      theme.set(v);
      showNameField = false;
      nameDraft = "";
    }}
    items={[
      ...THEMES.map((t) => ({ value: t.id, label: t.label })),
      ...theme.savedThemes.map((t) => ({ value: t.id, label: t.name, group: "Saved" })),
      { value: CUSTOM_THEME_ID, label: "Custom…", group: "Your colors" },
    ]}
    data-testid="theme-select"
    aria-label="Theme"
  />
</div>

{#if editing}
<div class="mt-4 space-y-4 border-t border-border pt-4">
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
