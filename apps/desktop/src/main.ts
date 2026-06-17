import { mount } from "svelte";
import App from "./app/App.svelte";
import OverlayComposer from "./app/OverlayComposer.svelte";
import { theme } from "./lib/theme.svelte";
import { streamReveal } from "./lib/stream-reveal.svelte";
import { modelPrefs } from "./lib/model-prefs.svelte";
import "./styles/app.css";
import "./styles/composer-device.css";
import "./styles/composer-device-parts.css";
import "./styles/composer-device-overrides.css";
import "./styles/composer-device-dark.css";

// Apply the persisted theme before mount so there's no flash of the default.
theme.init();
streamReveal.init();
// Load global model-selector prefs (pinned slots, hidden models).
modelPrefs.init();

// Same bundle serves both windows; overlay window loads with #overlay.
const Root = window.location.hash === "#overlay" ? OverlayComposer : App;
const app = mount(Root, { target: document.getElementById("app")! });

export default app;
