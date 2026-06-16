import { mount } from "svelte";
import App from "./app/App.svelte";
import OverlayComposer from "./app/OverlayComposer.svelte";
import { theme } from "./lib/theme.svelte";
import "./styles/app.css";
import "./styles/composer-device.css";
import "./styles/composer-device-parts.css";

// Apply the persisted theme before mount so there's no flash of the default.
theme.init();

// Same bundle serves both windows; overlay window loads with #overlay.
const Root = window.location.hash === "#overlay" ? OverlayComposer : App;
const app = mount(Root, { target: document.getElementById("app")! });

export default app;
