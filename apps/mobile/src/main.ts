import { mount } from "svelte";
import App from "./App.svelte";
import { store } from "./lib/store.svelte.ts";
import "./styles/app.css";
import "./styles/composer/composer-device.css";
import "./styles/composer/composer-device-dark.css";
import "./styles/composer/composer-device-parts.css";
import "./styles/composer/composer-device-overrides.css";
import "./styles/composer/metal-dye.css";
// Phone-size chassis geometry — must load last so it wins the cascade.
import "./styles/composer/composer-device-mobile.css";

// QR pairing: if opened via a `#connect?…` deep link, fold it into a saved
// master and land on its sessions before the first render.
store.consumeConnectLink();

// Hardware/browser back pops the in-app stack (see store.push/handlePopState).
window.addEventListener("popstate", (e) => store.handlePopState(e.state));

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

// iOS keyboard handling: Safari overlays the keyboard on the layout viewport
// instead of resizing it (`interactive-widget` is Chrome-only), which buries
// the bottom-anchored composer. In the installed app we size #app to the
// visual viewport so the composer rides above the keyboard; where the layout
// viewport already resizes (Chrome), vv.height matches and this is a no-op.
const standalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;
const vv = window.visualViewport;
if (standalone && vv) {
  const root = document.getElementById("app")!;
  const sync = (): void => {
    root.style.height = `${Math.round(vv.height)}px`;
    // iOS sometimes pans the page when focusing an input — pin it back.
    window.scrollTo(0, 0);
  };
  vv.addEventListener("resize", sync);
  sync();
}

// Register the app-shell service worker (PWA install / offline shell).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app works without the shell cache.
    });
  });
}

export default app;
