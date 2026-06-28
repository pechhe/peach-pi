<script lang="ts">
  // Slash command picker — the `/` menu.
  //
  // Extracted from Composer.svelte (issue #27). Owns the lazy command list
  // load, the browse-filter state + tabs, the match filtering, and the
  // dropdown markup. The host derives the caret `query` and supplies the
  // GUI-native system-command list (those aliases fire host-owned flows), so
  // this component stays free of imperative handles / model selectors.
  //
  // Picks + the skill-chip auto-collapse effect stay in the host (they mutate
  // the draft chip and touch host-owned state); the host passes pick handlers
  // in. Keyboard nav (ArrowUp/Down/Enter/Tab) is driven from the host's
  // textarea keydown matrix via `handleMenuKey`.
  import type { CommandInfo } from "@peach-pi/shared-types";
  import Star from "@lucide/svelte/icons/star";
  import { commandPrefs } from "../../stores/command-prefs.svelte";

  type SlashFilter = "starred" | "all" | CommandInfo["kind"];

  /** GUI-native "system" commands: slash aliases that fire the GUI flow.
   *  Passed in from the host so the SystemCommand list stays the source of
   *  truth there (host runs them via its own handles). */
  let {
    /** Active `/token` left of the caret, or null when the menu is closed. */
    query,
    /** The host-declared system-command list (names only here). */
    systemCommands,
    /** The host-loaded extension/prompt/skill commands (host owns the IPC load
     *  so the chip-auto-collapse effect + QuickSlots share one list). */
    loadedCommands,
    /** Active match index. Bindable so the host can reset / forward reads. */
    index = $bindable(0),
    /** Pick a slash command (skill prompt collapses to a chip; system/extension
     *  run now). The resolved body (with the `/token` stripped) is passed. */
    onPick,
  }: {
    query: string | null;
    systemCommands: CommandInfo[];
    loadedCommands: CommandInfo[];
    index?: number;
    onPick: (cmd: CommandInfo) => void;
  } = $props();

  let slashFilter = $state<SlashFilter>("starred");

  const allCommands = $derived<CommandInfo[]>([...systemCommands, ...loadedCommands]);
  const starKey = (c: CommandInfo) => `${c.kind}:${c.name}`;
  const hasStarred = $derived(allCommands.some((c) => commandPrefs.isStarred(starKey(c))));
  // While searching, "Starred" (the browse default) widens to "All" so a query
  // finds everything; an explicitly chosen tab still narrows the search. Used
  // for both matching and the active-tab highlight.
  const effectiveFilter = $derived<SlashFilter>(
    query && slashFilter === "starred" ? "all" : slashFilter,
  );
  const slashMatches = $derived.by(() => {
    if (query === null) return [];
    const filter = effectiveFilter;
    return allCommands
      .filter((c) =>
        filter === "all"
          ? true
          : filter === "starred"
            ? commandPrefs.isStarred(starKey(c))
            : c.kind === filter,
      )
      .filter((c) => c.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(query) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 50);
  });
  const slashKindsPresent = $derived(new Set(allCommands.map((c) => c.kind)));

  $effect(() => {
    void slashMatches;
    index = 0;
  });
  // Reset the browse filter each time the menu closes: reopen on "Starred" if
  // anything is starred, otherwise "All".
  $effect(() => {
    if (query === null) slashFilter = hasStarred ? "starred" : "all";
  });

  const commandKindLabel: Record<CommandInfo["kind"], string> = {
    skill: "skill",
    extension: "extension",
    prompt: "prompt",
    system: "system",
  };
  const commandKindBadge: Record<CommandInfo["kind"], string> = {
    skill: "bg-emerald-500/15 text-emerald-700",
    extension: "bg-sky-500/15 text-sky-700",
    prompt: "bg-violet-500/15 text-violet-700",
    system: "bg-amber-500/15 text-amber-700",
  };
  const slashTabs: Array<{ key: SlashFilter; label: string }> = [
    { key: "starred", label: "Starred" },
    { key: "all", label: "All" },
    { key: "system", label: "System" },
    { key: "extension", label: "Extensions" },
    { key: "skill", label: "Skills" },
    { key: "prompt", label: "Prompts" },
  ];
  const slashVisibleTabs = $derived(
    slashTabs.filter(
      (t) =>
        t.key === "all" ||
        t.key === "starred" ||
        slashKindsPresent.has(t.key as CommandInfo["kind"]),
    ),
  );

  function cycleSlashFilter(dir: 1 | -1) {
    const keys = slashVisibleTabs.map((t) => t.key);
    const i = keys.indexOf(slashFilter);
    slashFilter = keys[(i + dir + keys.length) % keys.length]!;
  }

  /**
   * Slash-menu keyboard nav, driven from the host's textarea keydown matrix.
   * Returns true when the key is consumed (Tab cycles tabs; ArrowUp/Down/Enter
   * when matches exist) so the host skips its remaining handlers.
   */
  export function handleMenuKey(e: KeyboardEvent): boolean {
    // Tab cycles the browse-filter tabs (Shift+Tab backwards) whenever the
    // menu is open, even with no matches.
    if (e.key === "Tab") {
      e.preventDefault();
      cycleSlashFilter(e.shiftKey ? -1 : 1);
      return true;
    }
    const matches = slashMatches;
    if (matches.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % matches.length;
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + matches.length) % matches.length;
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onPick(matches[index]!);
      return true;
    }
    return false;
  }
</script>

{#if query !== null}
  <div
    class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
    data-testid="slash-menu"
  >
    <!-- Browse tabs: click to filter by kind; Tab cycles them. -->
    <div class="flex items-center gap-1 border-b border-border-strong px-2 py-1.5">
      {#each slashVisibleTabs as tab (tab.key)}
        <button
          class="rounded px-2 py-0.5 text-[11px] font-medium
            {effectiveFilter === tab.key
              ? tab.key === 'all'
                ? 'bg-surface-3 text-fg'
                : tab.key === 'starred'
                  ? 'bg-amber-400/20 text-amber-700'
                  : commandKindBadge[tab.key]
              : 'text-faint hover:bg-surface-2'}"
          onclick={() => (slashFilter = tab.key)}>{tab.label}</button
        >
      {/each}
      <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-faint">
        <kbd
          class="rounded border border-border-strong bg-surface-2 px-1 py-0.5 font-sans text-[10px] leading-none"
          >⇥ Tab</kbd
        >
        to switch
      </span>
    </div>
    <div class="max-h-96 overflow-y-auto">
      {#each slashMatches as cmd, i (cmd.kind + ":" + cmd.name)}
        {@const starred = commandPrefs.isStarred(starKey(cmd))}
        <div
          class="flex items-center {i === index ? 'bg-surface-2' : ''} hover:bg-surface-2"
        >
          <button
            class="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 text-left text-sm"
            onclick={() => onPick(cmd)}
          >
            <span class="shrink-0 whitespace-nowrap font-mono text-fg">/{cmd.name}</span>
            <span class="min-w-0 truncate text-xs text-faint">{cmd.description}</span>
            <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {commandKindBadge[cmd.kind]}">{commandKindLabel[cmd.kind]}</span>
          </button>
          <button
            class="shrink-0 px-2 py-1.5 {starred ? 'text-amber-500' : 'text-faint hover:text-amber-500'}"
            title={starred ? "Unstar" : "Star"}
            aria-label={starred ? "Unstar command" : "Star command"}
            onclick={() => commandPrefs.toggle(starKey(cmd))}
          >
            <Star size={14} class={starred ? "fill-amber-400" : ""} />
          </button>
        </div>
      {:else}
        <div class="px-3 py-2 text-xs text-faint">
          {slashFilter === "starred" && !query
            ? "No starred commands yet — click the ★ to add one"
            : "No matching commands"}
        </div>
      {/each}
    </div>
  </div>
{/if}
