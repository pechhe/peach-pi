import { defineConfig, type PluginOption } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Cast needed because SvelteKit bundles its own Vite copy.
  plugins: [tailwindcss() as PluginOption, sveltekit()],
  // `@peach-pi/shared-types` and `$lib` aliases live in svelte.config.js
  // (kit.alias), which SvelteKit applies to both Vite + the generated
  // tsconfig — no duplication here.
});
