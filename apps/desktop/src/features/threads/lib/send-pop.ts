import { sendAnim } from "../../../stores/send-anim.svelte";

// A freshly-sent user message pops up into the page from its bottom-right
// corner (WhatsApp-style). One-shot imperative action rather than a reactive
// class: transcript ids are positional (u0/a1/u2…) and a `reset` op can
// renumber them, recreating these keyed nodes. The action runs once per node
// creation and only pops when it can claim a *fresh* send mark — consumed
// exactly once at send. So history-load and id-churn re-creations never pop.
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function sendPop(node: HTMLElement, threadId: string): void {
  if (prefersReducedMotion || !sendAnim.claim(threadId)) return;
  node.style.animation = "none"; // suppress the default item-enter so they don't stack
  node.style.transformOrigin = "bottom right";
  node.animate(
    [
      { opacity: 0, transform: "translateY(10px) scale(0.72)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}
