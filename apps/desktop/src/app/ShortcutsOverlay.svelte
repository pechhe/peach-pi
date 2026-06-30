<script lang="ts">
  // Keyboard-shortcut reference. Two ways in:
  //   • ⌘/ toggles a *pinned* panel (stays until Esc / backdrop click).
  //   • Holding ⌘ alone for HOLD_MS shows a *peek* that vanishes on release.
  // The peek timer is cancelled the moment any other key is pressed, so a real
  // shortcut (⌘K, ⌘N, …) never makes the panel flash — only ⌘ held on its own.
  //
  // Uses the same motion shell as the ⌘K command palette: portaled overlay,
  // blurred backdrop, spring-in panel (PANEL_SPRING / EASE_OUT).
  import { motion, useReducedMotion } from "motion-sv";
  import { portal } from "../lib/beui/portal";
  import { EASE_OUT } from "../lib/beui/ease";
  import { PANEL_SPRING } from "../lib/beui/command-palette.svelte";

  const HOLD_MS = 500;

  type Shortcut = { keys: string[]; label: string };
  type Group = { title: string; items: Shortcut[] };

  // Single source of truth — keep in sync with onGlobalKeydown (App.svelte),
  // ThreadView, and Composer.
  const groups: Group[] = [
    {
      title: "Global",
      items: [
        { keys: ["⌘", "K"], label: "Search & commands" },
        { keys: ["⌘", "N"], label: "New thread" },
        { keys: ["⌘", ","], label: "Settings" },
        { keys: ["⌘", "J"], label: "Toggle terminal" },
        { keys: ["⌘", "S"], label: "Toggle sidebar" },
        { keys: ["⌘", "["], label: "Back" },
        { keys: ["⌘", "]"], label: "Forward" },
        { keys: ["⌘", "/"], label: "Show shortcuts" },
      ],
    },
    {
      title: "Thread",
      items: [
        { keys: ["⌘", "F"], label: "Find in thread" },
        { keys: ["Esc"], label: "Stop / close find" },
      ],
    },
    {
      title: "Composer",
      items: [
        { keys: ["↵"], label: "Send message" },
        { keys: ["⇧", "↵"], label: "New line" },
        { keys: ["⌘", "B"], label: "Build mode" },
        { keys: ["⌘", "P"], label: "Plan mode" },
        { keys: ["↑"], label: "Recall last message" },
      ],
    },
  ];

  const browser = typeof window !== "undefined";
  const reduce = useReducedMotion();

  let pinned = $state(false);
  let peek = $state(false);
  let mounted = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const open = $derived(pinned || peek);

  // Hydration gate for portal target (mirrors the command palette).
  $effect(() => {
    mounted = true;
  });

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    peek = false;
  }

  function onKeydown(e: KeyboardEvent) {
    // ⌘/ toggles the pinned panel.
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      pinned = !pinned;
      cancelHold();
      return;
    }
    if (e.key === "Escape" && pinned) {
      e.preventDefault();
      pinned = false;
      return;
    }
    // Bare ⌘ (or Ctrl) held alone → arm the peek timer. Ignore key-repeat.
    if ((e.key === "Meta" || e.key === "Control") && !e.repeat) {
      if (!holdTimer && !peek) {
        holdTimer = setTimeout(() => {
          peek = true;
          holdTimer = null;
        }, HOLD_MS);
      }
      return;
    }
    // Any other key means a real shortcut (or typing) — never peek.
    cancelHold();
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.key === "Meta" || e.key === "Control") cancelHold();
  }
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onblur={cancelHold} />

{#if mounted}
  <!-- Portaled to <body> so transformed/fixed ancestors can't trap the overlay. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    aria-hidden={!open}
    data-testid="shortcuts-overlay"
    class="fixed inset-0 z-[100] {open ? 'pointer-events-auto' : 'pointer-events-none'}"
  >
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: open ? 0.18 : 0.12, ease: EASE_OUT }}
      onclick={() => (pinned = false)}
      class="absolute inset-0 bg-bg/5 [backdrop-filter:blur(12px)_saturate(140%)] [-webkit-backdrop-filter:blur(12px)_saturate(140%)] {open ? 'pointer-events-auto' : 'pointer-events-none'}"
    ></motion.div>

    <div
      class="pointer-events-none absolute inset-0 flex items-start justify-center p-4 pt-[18vh]"
      style="padding-left: var(--content-left, 0px)"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabindex={-1}
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open || reduce.current ? 0 : -8,
          scale: open || reduce.current ? 1 : 0.97,
        }}
        transition={reduce.current ? { duration: 0.1 } : open ? PANEL_SPRING : { duration: 0.12, ease: EASE_OUT }}
        class="w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl will-change-transform {open ? 'pointer-events-auto' : 'pointer-events-none'}"
      >
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Keyboard shortcuts
          </span>
          <kbd class="rounded border border-border-strong bg-bg px-1.5 py-0.5 text-[10px] text-faint">
            {pinned ? "ESC" : "hold ⌘"}
          </kbd>
        </div>

        <div class="grid max-h-[60vh] grid-cols-2 gap-x-8 gap-y-5 overflow-y-auto p-5">
          {#each groups as group}
            <div>
              <div class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fainter">
                {group.title}
              </div>
              <div class="flex flex-col gap-1.5">
                {#each group.items as item}
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-xs text-muted">{item.label}</span>
                    <span class="flex shrink-0 items-center gap-1">
                      {#each item.keys as key}
                        <kbd
                          class="min-w-[1.4rem] rounded border border-border-strong bg-bg px-1.5 py-0.5 text-center text-[10px] text-faint"
                        >
                          {key}
                        </kbd>
                      {/each}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </motion.div>
    </div>
  </div>
{/if}
