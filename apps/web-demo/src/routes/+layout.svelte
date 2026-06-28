<script lang="ts">
  // Import the mock IPC bridge FIRST. Its module top-level code installs
  // `window.peachPi` synchronously, before any of the renderer's store
  // modules import/run (recording.svelte.ts, theme.svelte, etc. all call
  // `api.invoke(...)` at module-load time during `new Store()`).
  import "../lib/mock-peach-pi";

  // Pull in the desktop renderer's stylesheet stack in the exact order the
  // desktop `main.ts` uses — this is what gives the rendered components their
  // real look (theme tokens, skeuomorphic composer chassis, sidebar device).
  import "../desktop-renderer/styles/app.css";
  import "../desktop-renderer/styles/composer-device.css";
  import "../desktop-renderer/styles/composer-device-parts.css";
  import "../desktop-renderer/styles/composer-device-overrides.css";
  import "../desktop-renderer/styles/composer-device-dark.css";
  import "../desktop-renderer/styles/sidebar-device.css";
  import "../desktop-renderer/styles/metal-dye.css";

  import { onMount } from "svelte";
  import { theme } from "../desktop-renderer/lib/theme.svelte";
  import { streamReveal } from "../desktop-renderer/lib/stream-reveal.svelte";
  import { modelPrefs } from "../desktop-renderer/lib/model-prefs.svelte";
  import { loaderPrefs } from "../desktop-renderer/lib/loader-prefs.svelte";
  import { suppressNativeTooltips } from "../desktop-renderer/lib/suppress-native-tooltips.ts";
  import { TRAFFIC_LIGHT_BOTTOM } from "@peach-pi/shared-types";

  onMount(() => {
    suppressNativeTooltips();
    // Apply macOS traffic-light clearance so sidebar content starts below the
    // OS-drawn buttons. Purely cosmetic in the browser (we draw fake lights
    // in the page chrome instead) — but it sets the same CSS var the desktop
    // CSS expects, so layout matches.
    document.documentElement.style.setProperty(
      "--titlebar-content-top",
      `${TRAFFIC_LIGHT_BOTTOM}px`,
    );
    // Bootstrap persisted prefs (theme, model slots, loaders). Each one calls
    // `api.invoke(...)` internally — the mock resolves all unknown channels
    // to `undefined`, so these are safe no-ops.
    theme.init();
    streamReveal.init();
    modelPrefs.init();
    loaderPrefs.init();
  });

  let { children } = $props();
</script>

{@render children()}
