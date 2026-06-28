/**
 * Svelte action: relocate an element to the end of <body>.
 *
 * The element keeps its own children/events/styles; it just gets a new parent.
 * This decouples it from ancestor transforms/overflow/containment — useful for
 * `position: fixed` popovers that must resolve against the viewport even when
 * an ancestor (e.g. an animating sidebar rail) carries a `transform`, which
 * would otherwise become their containing block and clip/misposition them.
 *
 * The node is returned to its original parent on destroy.
 */
export function portal(node: HTMLElement): { destroy(): void } {
  const originalParent = node.parentElement;
  originalParent?.removeChild(node);
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
