<script lang="ts" module>
  // Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
  // Adapted for peach-pi:
  //  - token classes remapped to the app's @theme tokens
  //    (bg-surface / text-fg / text-muted / border-border-strong / bg-surface-2)
  //  - CommandItem extended with `description` (Snippet) for sub-label text
  //    (e.g. thread search snippet / project name)
  //  - `onQueryChange` prop added so hosts can drive async result refresh
  //    (e.g. debounced IPC thread search).
  import type { Component, Snippet } from "svelte";

  export type CommandItem = {
    id: string;
    label: string;
    group?: string;
    hint?: string;
    keywords?: string[];
    icon?: Component;
    badge?: Snippet;
    /** Optional muted sub-label rendered below the label (e.g. a search snippet). */
    description?: Snippet;
    /** When true, this item bypasses the palette's local fuzzy filter —
     *  for externally-curated results already filtered by their own search
     *  (e.g. full-text thread search over message bodies). */
    disableFilter?: boolean;
    onSelect: () => void;
  };

  function fuzzyMatch(needle: string, hay: string) {
    if (!needle) return true;
    const n = needle.toLowerCase();
    const h = hay.toLowerCase();
    let i = 0;
    for (const ch of h) {
      if (ch === n[i]) i++;
      if (i === n.length) return true;
    }
    return false;
  }

  // Opened via a keyboard shortcut many times a day — entrance must read as
  // instant. Tight spring, even faster exit.
  const PANEL_SPRING = { type: "spring", stiffness: 560, damping: 40, mass: 0.5 } as const;

  // Exported so consumers can build the fuzzy filter once if needed.
  export { fuzzyMatch, PANEL_SPRING };
</script>

<script lang="ts">
  import { motion, useReducedMotion } from "motion-sv";
  import { portal } from "./portal";
  import { EASE_OUT } from "./ease";
  import { cn } from "../utils";
  import Search from "@lucide/svelte/icons/search";

  interface CommandPaletteProps {
    items: CommandItem[];
    /** Opens with Cmd/Ctrl + this key. Default: "k" */
    shortcut?: string;
    placeholder?: string;
    emptyMessage?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Fired whenever the query changes — hosts use this to refresh async
     *  result sets (e.g. debounced full-text thread search). */
    onQueryChange?: (query: string) => void;
    /** When true, shows a "Searching…" hint in the empty state. */
    loading?: boolean;
  }

  let {
    items,
    shortcut = "k",
    placeholder = "Type a command or search…",
    emptyMessage = "No results found.",
    open: controlledOpen,
    onOpenChange,
    onQueryChange,
    loading = false,
  }: CommandPaletteProps = $props();

  const browser = typeof window !== "undefined";
  const reduce = useReducedMotion();

  // Controlled vs uncontrolled open state.
  let internalOpen = $state(false);
  const controlled = $derived(controlledOpen !== undefined);
  const open = $derived(controlled ? (controlledOpen as boolean) : internalOpen);
  const setOpen = (v: boolean) => {
    if (!controlled) internalOpen = v;
    onOpenChange?.(v);
  };

  let query = $state("");
  let active = $state(0);
  let mounted = $state(false);

  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  // Module-style uuid scope: unique per palette instance so multiple palettes
  // don't share an active-row indicator.
  const uid = `beui-cmd-${Math.random().toString(36).slice(2, 9)}`;

  const updateQuery = (value: string) => {
    query = value;
    active = 0;
    onQueryChange?.(value);
  };

  // ⌘K / Ctrl+K toggle, Esc to close.
  $effect(() => {
    if (!browser) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === shortcut.toLowerCase()) {
        e.preventDefault();
        setOpen(!open);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Reset + focus on open.
  $effect(() => {
    if (!open) return;
    query = "";
    active = 0;
    onQueryChange?.("");
    const raf = requestAnimationFrame(() => inputEl?.focus());
    return () => cancelAnimationFrame(raf);
  });

  // Lock body scroll while open.
  $effect(() => {
    if (!browser || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  });

  // Hydration gate for portal target.
  $effect(() => {
    mounted = true;
  });

  const filtered = $derived(
    !query
      ? items
      : items.filter((it) => {
          if (it.disableFilter) return true;
          const haystacks = [it.label, it.group ?? "", ...(it.keywords ?? [])];
          return haystacks.some((h) => fuzzyMatch(query, h));
        }),
  );

  const hasIcons = $derived(items.some((it) => it.icon));

  // Flatten into indexed rows carrying their group label for grouping on render.
  type Row = CommandItem & { idx: number; group: string };
  const rows = $derived(
    (() => {
      const map = new Map<string, CommandItem[]>();
      for (const it of filtered) {
        const g = it.group ?? "Results";
        const arr = map.get(g) ?? [];
        arr.push(it);
        map.set(g, arr);
      }
      const out: Row[] = [];
      let i = 0;
      for (const [group, list] of map) {
        for (const it of list) out.push({ ...it, idx: i++, group });
      }
      return out;
    })(),
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(filtered.length - 1, active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[active];
      if (it) {
        it.onSelect();
        setOpen(false);
      }
    }
  };

  // Keep the active row scrolled into view.
  $effect(() => {
    if (!browser || !open) return;
    void active;
    const el = listEl?.querySelector<HTMLButtonElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  });
</script>

{#if mounted}
  <!-- Portaled to <body> so ancestors with transforms, filters, or fixed
       positioning can't trap the overlay in their stacking context. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    aria-hidden={!open}
    data-testid="search-overlay"
    class={cn("fixed inset-0 z-[100]", open ? "pointer-events-auto" : "pointer-events-none")}
  >
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: open ? 0.18 : 0.12, ease: EASE_OUT }}
      onclick={() => setOpen(false)}
      class={cn(
        "absolute inset-0 bg-bg/5 [backdrop-filter:blur(12px)_saturate(140%)] [-webkit-backdrop-filter:blur(12px)_saturate(140%)]",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    ></motion.div>

    <div class="pointer-events-none absolute inset-0 flex items-start justify-center p-4 pt-[18vh]" style="padding-left: var(--content-left, 0px)">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabindex={-1}
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          y: open || reduce.current ? 0 : -8,
          scale: open || reduce.current ? 1 : 0.97,
        }}
        transition={reduce.current ? { duration: 0.1 } : open ? PANEL_SPRING : { duration: 0.12, ease: EASE_OUT }}
        onkeydown={onKeyDown}
        class={cn(
          "w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl will-change-transform",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div class="flex items-center gap-3 border-b border-border px-4">
          <Search class="h-4 w-4 text-faint" />
          <input
            bind:this={inputEl}
            value={query}
            oninput={(e) => updateQuery(e.currentTarget.value)}
            {placeholder}
            tabindex={open ? 0 : -1}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${uid}-list`}
            aria-activedescendant={filtered.length > 0 ? `${uid}-opt-${active}` : undefined}
            aria-autocomplete="list"
            class="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-muted outline-none"
            data-testid="search-input"
          />
          <kbd class="hidden rounded border border-border-strong bg-bg px-1.5 py-0.5 text-[10px] text-faint sm:inline-block">
            ESC
          </kbd>
        </div>

        <div bind:this={listEl} id={`${uid}-list`} role="listbox" aria-label="Commands" class="max-h-[60vh] overflow-y-auto p-2" data-testid="command-palette-list">
          {#if filtered.length === 0}
            <div class="p-8 text-center text-sm text-faint">{loading ? "Searching…" : emptyMessage}</div>
          {:else}
            {#each rows as it (it.id)}
              {@const isActive = it.idx === active}
              {#if it.idx === 0 || rows[it.idx - 1]?.group !== it.group}}
                <div aria-hidden="true" class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fainter">
                  {it.group}
                </div>
              {/if}
              <button
                type="button"
                id={`${uid}-opt-${it.idx}`}
                role="option"
                aria-selected={isActive}
                data-index={it.idx}
                onmouseenter={() => (active = it.idx)}
                onclick={() => {
                  it.onSelect();
                  setOpen(false);
                }}
                tabindex={open ? 0 : -1}
                class={cn(
                  "relative isolate flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  isActive ? "text-fg" : "text-muted",
                )}
                data-testid="command-palette-item"
              >
                <!-- Active-row highlight glides between rows via shared layout. -->
                {#if isActive}
                  <motion.span
                    layoutId={`${uid}-active`}
                    class="absolute inset-0 z-0 rounded-md bg-surface-2"
                    transition={
                      reduce.current
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 480, damping: 38 }
                    }
                  ></motion.span>
                {/if}

                {#if it.icon}
                  {@const Icon = it.icon}
                  <Icon class="relative z-10 h-4 w-4" />
                {:else if hasIcons}
                  <span class="relative z-10 h-4 w-4"></span>
                {/if}

                <span class="relative z-10 flex-1 min-w-0">
                  <span class="block truncate">{it.label}</span>
                  {#if it.description}
                    <span class="block truncate text-xs text-fainter">
                      {@render it.description()}
                    </span>
                  {/if}
                </span>

                {#if it.badge}
                  <span class="relative z-10 shrink-0 text-xs text-faint">
                    {@render it.badge()}
                  </span>
                {/if}

                {#if it.hint}
                  <kbd class="relative z-10 rounded border border-border-strong bg-bg px-1.5 py-0.5 text-[10px] text-faint">
                    {it.hint}
                  </kbd>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </motion.div>
    </div>
  </div>
{/if}
