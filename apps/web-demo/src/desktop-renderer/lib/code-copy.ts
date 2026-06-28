// Svelte action: injects a "Copy" button into every <pre> code block inside
// `node`. Used on rendered markdown (assistant responses) so large fenced code
// blocks can be copied individually.
//
// Markdown is injected via {@html} and, while streaming, StreamingText rebuilds
// innerHTML every animation frame — re-attaching buttons each tick would fl/
// flicker. So we only enhance once enabled (i.e. streaming finished) and watch
// for later DOM swaps with a MutationObserver.

const MIN_LINES = 3; // only "large" blocks get their own button

function attachButton(pre: HTMLPreElement): void {
  if (pre.dataset.copyEnhanced === "1") return;
  const code = pre.querySelector("code");
  const source = code?.textContent ?? pre.textContent ?? "";
  if (source.replace(/\n$/, "").split("\n").length < MIN_LINES) return;

  pre.dataset.copyEnhanced = "1";
  pre.classList.add("code-copy-host");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "code-copy-btn";
  btn.textContent = "Copy";
  btn.setAttribute("aria-label", "Copy code");
  btn.addEventListener("click", () => {
    void navigator.clipboard.writeText(code?.textContent ?? pre.textContent ?? "").then(() => {
      btn.textContent = "Copied";
      btn.classList.add("is-copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("is-copied");
      }, 1500);
    });
  });
  pre.appendChild(btn);
}

import { extensionUi } from "../stores/extension-ui.svelte";

/**
 * Svelte action: an element that copies its own text on click. Used on paths,
 * error messages, and other content users want to grab without highlighting.
 * Sets a "Click to copy" tooltip, briefly flashes "Copied!", and toasts.
 */
export function clickCopy(node: HTMLElement, text?: string) {
  node.style.cursor = "pointer";
  const baseTitle = node.getAttribute("title") ?? "Click to copy";
  node.setAttribute("title", baseTitle);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let toasting = false;

  function onClick() {
    const content = (text ?? node.textContent ?? "").trim();
    if (!content) return;
    void navigator.clipboard.writeText(content).then(() => {
      node.classList.add("is-copied");
      node.setAttribute("title", "Copied!");
      clearTimeout(timer);
      timer = setTimeout(() => {
        node.classList.remove("is-copied");
        node.setAttribute("title", baseTitle);
      }, 1500);
      if (!toasting) {
        toasting = true;
        extensionUi.notify("Copied");
        setTimeout(() => (toasting = false), 1500);
      }
    });
  }

  node.addEventListener("click", onClick);
  return {
    destroy() {
      clearTimeout(timer);
      node.removeEventListener("click", onClick);
    },
  };
}

export function codeCopy(node: HTMLElement, enabled = true) {
  let observer: MutationObserver | undefined;

  function enhance() {
    node.querySelectorAll<HTMLPreElement>("pre").forEach(attachButton);
  }

  function start() {
    enhance();
    observer = new MutationObserver(() => enhance());
    observer.observe(node, { childList: true, subtree: true });
  }

  function stop() {
    observer?.disconnect();
    observer = undefined;
  }

  if (enabled) start();

  return {
    update(next: boolean) {
      if (next && !observer) start();
      else if (!next && observer) stop();
    },
    destroy() {
      stop();
    },
  };
}
