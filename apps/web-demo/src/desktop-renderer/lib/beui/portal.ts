// Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
// Svelte action: relocate a node to <body> (or a custom target). Decouples
// `position: fixed` overlays from transformed ancestors. SSR-safe.
import type { Action } from "svelte/action";

const browser = typeof window !== "undefined";

export const portal: Action<HTMLElement, HTMLElement | null | undefined> = (
  node,
  target,
) => {
  if (!browser) return;
  const dest = target ?? document.body;
  dest.appendChild(node);
  return {
    update(next?: HTMLElement | null) {
      (next ?? document.body).appendChild(node);
    },
    destroy() {
      node.remove();
    },
  };
};
