import { mount } from "svelte";
import App from "./app/App.svelte";
import HudComposer from "./app/HudComposer.svelte";
import { theme } from "./lib/theme.svelte";
import { streamReveal } from "./lib/stream-reveal.svelte";
import { modelPrefs } from "./lib/model-prefs.svelte";
import { initDevTapRenderer } from "./devtap-renderer.ts";
import { suppressNativeTooltips } from "./lib/suppress-native-tooltips.ts";
import "./styles/app.css";
import "./styles/composer-device.css";
import "./styles/composer-device-parts.css";
import "./styles/composer-device-overrides.css";
import "./styles/composer-device-dark.css";

// DevTap renderer error capture (dev only; main drops events unless DEV_TAP=1).
if (import.meta.env.DEV) initDevTapRenderer();

// Hide OS/browser `title` popovers; the app renders its own tooltips.
suppressNativeTooltips();
// Apply the persisted theme before mount so there's no flash of the default.
theme.init();
streamReveal.init();
// Load global model-selector prefs (pinned slots, hidden models).
modelPrefs.init();

// Same bundle serves both windows; the HUD window loads with #hud.
const isHud = window.location.hash === "#hud";
// The HUD is a transparent overlay: drop the opaque app background so only the
// composer and the chat card paint; everything else shows the desktop through.
if (isHud) document.documentElement.classList.add("hud-window");
const Root = isHud ? HudComposer : App;
const app = mount(Root, { target: document.getElementById("app")! });

export default app;
