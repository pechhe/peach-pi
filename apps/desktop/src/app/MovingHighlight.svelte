<script lang="ts">
  import { untrack, type Snippet } from "svelte";

  let {
    class: className = "",
    itemSelector,
    activeSelector,
    previewSelector = "",
    children,
  }: {
    class?: string;
    /** CSS selector matching the highlightable items inside this group. */
    itemSelector: string;
    /** CSS selector matching the currently-selected item. */
    activeSelector: string;
    /** Optional CSS selector for a keyboard-previewed item (e.g. ⌘⇧↑/↓
     *  traversal). When it matches an item here, the hover indicator glides
     *  to it regardless of the pointer. */
    previewSelector?: string;
    children: Snippet;
  } = $props();

  type Box = {
    left: number;
    top: number;
    width: number;
    height: number;
    ready: boolean;
    visible: boolean;
  };
  const hidden = (): Box => ({ left: 0, top: 0, width: 0, height: 0, ready: false, visible: false });
  const sameBox = (a: Box, b: Box): boolean =>
    a.ready === b.ready &&
    a.visible === b.visible &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;

  let container = $state<HTMLDivElement | null>(null);
  let hoveredItem: HTMLElement | null = null;
  let hover = $state<Box>(hidden());
  let active = $state<Box>(hidden());
  let shouldAnimate = $state(false);

  function measure(target: HTMLElement): Box {
    const c = container!.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    return {
      left: t.left - c.left,
      top: t.top - c.top,
      width: t.width,
      height: t.height,
      ready: true,
      visible: true,
    };
  }

  function setHover(target: HTMLElement | null) {
    const next =
      !container || !target
        ? hover.ready
          ? { ...hover, visible: false }
          : hidden()
        : measure(target);
    if (!sameBox(hover, next)) hover = next;
  }

  function setActive(target: HTMLElement | null) {
    const next =
      !container || !target
        ? active.ready
          ? { ...active, visible: false }
          : hidden()
        : measure(target);
    // Skip no-op reassignments: re-rendering rows (status, timestamps, title
    // generation) fire the observers constantly; reapplying an unchanged box
    // would thrash layout and stutter the in-flight slide.
    if (!sameBox(active, next)) active = next;
  }

  /** Last element matched by activeSelector; lets the MutationObserver skip
   *  snapshot churn (status dots, timestamps) that doesn't move the highlight. */
  let lastActiveEl: HTMLElement | null = null;

  function updateActive() {
    const el = container?.querySelector<HTMLElement>(activeSelector) ?? null;
    lastActiveEl = el;
    setActive(el);
    // Once an item becomes active, drop its hover highlight so the two don't stack.
    if (el && el === hoveredItem) {
      hoveredItem = null;
      setHover(null);
    }
  }

  /** Element currently targeted by keyboard preview (previewSelector),
   *  tracked so pointer hover can take over again once the preview clears. */
  let previewEl: HTMLElement | null = null;

  // Drive the hover indicator from a keyboard preview. Only the MovingHighlight
  // whose container actually contains the previewed item lights up; others
  // match nothing and clear their preview state.
  $effect(() => {
    if (!container) return;
    const sel = previewSelector;
    // untrack: setHover reads+writes `hover`; depending on it here would
    // re-run this effect on every pointer-driven hover change.
    untrack(() => {
      if (!sel) {
        if (previewEl) {
          previewEl = null;
          hoveredItem = null;
          setHover(null);
        }
        return;
      }
      const el = container!.querySelector<HTMLElement>(sel);
      if (el && !el.matches(activeSelector)) {
        previewEl = el;
        hoveredItem = el;
        setHover(el);
      } else if (previewEl) {
        // Preview points elsewhere (or at the already-active row): drop our
        // preview claim so a sibling group can take it.
        previewEl = null;
        hoveredItem = null;
        setHover(null);
      }
    });
  });

  function itemFrom(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const item = target.closest<HTMLElement>(itemSelector);
    if (!item || item.matches(activeSelector)) return null;
    return item;
  }

  // Position once without animating on first appearance, then enable transitions
  // so subsequent moves glide. Mirrors the double-rAF gate from peche-pi.
  $effect(() => {
    if (shouldAnimate || (!hover.ready && !active.ready)) return;
    let f1 = 0;
    let f2 = 0;
    f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => (shouldAnimate = true));
    });
    return () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
    };
  });

  // Coalesce observer-driven re-measures into a single animation frame. Without
  // this, a burst of DOM mutations (a snapshot re-render touching many rows)
  // triggers one synchronous getBoundingClientRect per record → layout thrash
  // that stutters the GPU slide. One measure per frame is plenty.
  let rafId = 0;
  function scheduleRemeasure() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      setHover(hoveredItem);
      updateActive();
    });
  }

  // Re-measure when the container/items resize, and when the active class moves
  // between items (selecting a different thread does not resize anything).
  $effect(() => {
    if (!container) return;
    // untrack: updateActive reads/writes `active`+`hover`; without this the
    // effect would depend on the state it mutates → infinite re-run
    // (effect_update_depth_exceeded) whenever no item matches activeSelector.
    untrack(() => updateActive());
    // Sizes changed → the box may have moved, so always re-measure.
    const ro = new ResizeObserver(() => scheduleRemeasure());
    ro.observe(container);
    for (const item of container.querySelectorAll<HTMLElement>(itemSelector)) ro.observe(item);
    // DOM mutations fire on every snapshot (running spinners, fresh timestamps,
    // generated titles). For attribute churn, only re-measure when the *selected*
    // element actually changed. But childList mutations mean rows were added,
    // removed, or reordered (e.g. sending a message bumps a thread to the top):
    // the active element keeps its identity yet moves, so always re-measure.
    const mo = new MutationObserver((records) => {
      const structural = records.some((r) => r.type === "childList");
      const el = container?.querySelector<HTMLElement>(activeSelector) ?? null;
      if (structural || el !== lastActiveEl) scheduleRemeasure();
    });
    mo.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      ro.disconnect();
      mo.disconnect();
    };
  });

  const transition = $derived(
    shouldAnimate
      ? "transform 350ms cubic-bezier(0.32, 1.15, 0.60, 1.00), width 250ms cubic-bezier(0.22, 1, 0.36, 1), height 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease"
      : "opacity 150ms ease",
  );
</script>

<div
  bind:this={container}
  class="sidebar-moving-highlight {className}"
  onpointermove={(e) => {
    const next = itemFrom(e.target);
    if (next === hoveredItem) return;
    hoveredItem = next;
    setHover(next);
  }}
  onpointerleave={() => {
    hoveredItem = null;
    setHover(null);
  }}
  onfocusin={(e) => {
    const next = itemFrom(e.target);
    hoveredItem = next;
    setHover(next);
  }}
  onfocusout={(e) => {
    if (container && e.relatedTarget instanceof Node && container.contains(e.relatedTarget)) return;
    hoveredItem = null;
    setHover(null);
  }}
>
  <div
    aria-hidden="true"
    class="sidebar-moving-highlight__indicator sidebar-moving-highlight__indicator--hover"
    style="transform: translate3d({hover.left}px, {hover.top}px, 0); width: {hover.width}px; height: {hover.height}px; opacity: {hover.visible ? 1 : 0}; transition: {transition};"
  ></div>
  <div
    aria-hidden="true"
    class="sidebar-moving-highlight__indicator sidebar-moving-highlight__indicator--active"
    style="transform: translate3d({active.left}px, {active.top}px, 0); width: {active.width}px; height: {active.height}px; opacity: {active.visible ? 1 : 0}; transition: {transition};"
  ></div>
  {@render children()}
</div>
