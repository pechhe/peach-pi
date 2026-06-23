// Suppress native browser `title` tooltips app-wide.
//
// The app renders its own tooltips via ./app/Tooltip.svelte; bare `title=`
// attributes left on some elements still trigger the OS/browser popover,
// which is visually off-brand and clips into adjacent UI (e.g. Sidebar
// thread rows). CSS cannot hide native tooltips, so we blank the attribute
// on hover/focus — before the native delay fires — and restore it on
// leave/blur so tests/inspectors still see the original value.

const CACHE = "data-pt-native-title";

function blank(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  const t = target.getAttribute("title");
  if (t === null) return;
  target.setAttribute(CACHE, t);
  target.removeAttribute("title");
}

function restore(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  const t = target.getAttribute(CACHE);
  if (t === null) return;
  target.setAttribute("title", t);
  target.removeAttribute(CACHE);
}

export function suppressNativeTooltips() {
  // mouseover/mouseout bubble, so a single capture-phase listener on
  // document catches every element, including dynamically added ones.
  document.addEventListener("mouseover", (e) => blank(e.target), true);
  document.addEventListener("mouseout", (e) => restore(e.target), true);
  document.addEventListener("focusin", (e) => blank(e.target), true);
  document.addEventListener("focusout", (e) => restore(e.target), true);
}
