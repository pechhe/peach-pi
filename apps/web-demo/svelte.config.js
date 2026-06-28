import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  // The vendored desktop renderer triggers pre-existing svelte warnings
  // (a11y, non_reactive_update, state_referenced_locally, etc.) that exist
  // in the upstream code. CI treats them as errors — suppress all so the
  // demo build succeeds without touching upstream source.
  onwarn: (_warning, _defaultHandler) => { /* noop */ },
  kit: {
    // Pin Node runtime so local builds on Node 24 still adapt cleanly.
    adapter: adapter({ runtime: "nodejs22.x" }),
    files: {
      // Point SvelteKit's `$lib` alias at the vendored desktop renderer's
      // lib directory so the renderer's `$lib/...` imports resolve there
      // instead of the demo's own `src/lib/` (which holds only mock files).
      lib: "src/desktop-renderer/lib",
    },
    alias: {
      // Vendored from packages/shared-types/src so the demo builds standalone.
      "@peach-pi/shared-types": fileURLToPath(
        new URL("./src/shared-types/index.ts", import.meta.url),
      ),
    },
  },
};
