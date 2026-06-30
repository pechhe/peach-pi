import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  define: {
    // Baked at build time. `VITE_*` env vars are already on import.meta.env.
    APP_VERSION: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  optimizeDeps: {
    // `@peach-pi/shared-types` is a symlinked workspace source package (its
    // `main` is src/index.ts). If Vite pre-bundles it into .vite/deps, edits to
    // its source (e.g. EXECUTOR_PRESETS) are served stale until the cache is
    // busted — which silently broke favicons here. Exclude it so it goes
    // through the normal transform + HMR pipeline and stays fresh.
    exclude: ["@peach-pi/shared-types"],
  },
});
