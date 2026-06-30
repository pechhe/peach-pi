<script lang="ts">
  // Keyboard-shortcut reference. Two ways in:
  //   • ⌘/ toggles a *pinned* panel (stays until Esc / backdrop click).
  //   • Holding ⌘ alone for HOLD_MS shows a *peek* that vanishes on release.
  // The peek timer is cancelled the moment any other key is pressed, so a real
  // shortcut (⌘K, ⌘N, …) never makes the panel flash — only ⌘ held on its own.
  // This mirrors HudComposer's Meta-hold dim.

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

  let pinned = $state(false);
  let peek = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const visible = $derived(pinned || peek);

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

{#if visible}
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-8"
    style="padding-left: var(--content-left, 0px)"
    role={pinned ? "button" : "presentation"}
    tabindex={pinned ? 0 : -1}
    aria-label={pinned ? "Close keyboard shortcuts" : undefined}
    onclick={() => (pinned = false)}
    onkeydown={(e) => pinned && (e.key === "Enter" || e.key === " ") && (pinned = false)}
    data-testid="shortcuts-overlay"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="max-h-full w-[40rem] max-w-full overflow-y-auto rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="mb-4 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Keyboard shortcuts
        </span>
        <span class="text-[10px] text-fainter">
          {pinned ? "Esc to close" : "hold ⌘"}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-x-8 gap-y-5">
        {#each groups as group}
          <div>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-fainter">
              {group.title}
            </div>
            <div class="flex flex-col gap-1.5">
              {#each group.items as item}
                <div class="flex items-center justify-between gap-3">
                  <span class="text-xs text-fg-soft">{item.label}</span>
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
    </div>
  </div>
{/if}
