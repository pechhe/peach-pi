import { mount } from "svelte";
import App from "./App.svelte";
import { store } from "./lib/store.svelte.ts";
import "./styles/app.css";
import "./styles/composer/composer-device.css";
import "./styles/composer/composer-device-dark.css";
import "./styles/composer/composer-device-parts.css";
import "./styles/composer/composer-device-overrides.css";
import "./styles/composer/metal-dye.css";

// QR pairing: if opened via a `#connect?…` deep link, fold it into a saved
// master and land on its sessions before the first render.
store.consumeConnectLink();

// Follow the system theme (the desktop ships both; the prototype mirrors them).
function applyTheme(): void {
  const light = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = light ? "light" : "dark";
  // Match the skeuomorphic composer chassis to the theme so the metallic
  // device (light cream-metal vs dark espresso variant) mirrors the app.
  document.documentElement.dataset.composer = light ? "light" : "dark";
}
applyTheme();
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

const app = mount(App, { target: document.getElementById("app")! });

// Register the app-shell service worker (PWA install / offline shell).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app works without the shell cache.
    });
  });
}

export default app;
