import { mount } from "svelte";
import App from "./app/App.svelte";
import HudComposer from "./app/HudComposer.svelte";
import { theme } from "./lib/theme.svelte";
import { streamReveal } from "./lib/stream-reveal.svelte";
import { modelPrefs } from "./lib/model-prefs.svelte";
import { loaderPrefs } from "./lib/loader-prefs.svelte";
import { initDevTapRenderer } from "./devtap-renderer.ts";
import { suppressNativeTooltips } from "./lib/suppress-native-tooltips.ts";
import { TRAFFIC_LIGHT_BOTTOM } from "@peach-pi/shared-types";
import "./styles/app.css";
import "./styles/composer-device.css";
import "./styles/composer-device-parts.css";
import "./styles/composer-device-overrides.css";
import "./styles/composer-device-dark.css";
import "./styles/sidebar-device.css";
import "./styles/metal-dye.css";

// DevTap renderer error capture (dev only; main drops events unless DEV_TAP=1).
if (import.meta.env.DEV) initDevTapRenderer();

// Hide OS/browser `title` popovers; the app renders its own tooltips.
suppressNativeTooltips();
// Expose the vertical traffic-light clearance so sidebar/nav content starts
// below the OS-drawn buttons. Only macOS draws hiddenInset traffic lights;
// elsewhere a plain drag strip height is kept. Expressed in 100%-zoom CSS px
// and divided by --zoom-factor (defaults to 1) so the physical gap stays
// constant under renderer content zoom — the native buttons don't scale.
const isMac = navigator.userAgent.includes("Mac");
document.documentElement.style.setProperty(
  "--titlebar-content-top",
  `${isMac ? TRAFFIC_LIGHT_BOTTOM : 40}px`,
);
// Apply the persisted theme before mount so there's no flash of the default.
theme.init();
streamReveal.init();
// Load global model-selector prefs (pinned slots, hidden models).
modelPrefs.init();
// Load curated dot-matrix loader selections per surface (square/hex/triangle).
loaderPrefs.init();

// Auto-hide scrollbar thumb: reveal only while actively scrolling.
// Matches the Composer textarea's `.is-scrolling` pattern, applied globally.
const scrollTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
document.addEventListener("scroll", (e) => {
  const el = e.target as Element;
  if (!(el instanceof HTMLElement)) return;
  el.classList.add("is-scrolling");
  const existing = scrollTimers.get(el);
  if (existing) clearTimeout(existing);
  scrollTimers.set(el, setTimeout(() => el.classList.remove("is-scrolling"), 700));
}, true);

// Same bundle serves both windows; the HUD window loads with #hud.
const isHud = window.location.hash === "#hud";
// The HUD is a transparent overlay: drop the opaque app background so only the
// composer and the chat card paint; everything else shows the desktop through.
if (isHud) document.documentElement.classList.add("hud-window");
const Root = isHud ? HudComposer : App;
const app = mount(Root, { target: document.getElementById("app")! });

export default app;
