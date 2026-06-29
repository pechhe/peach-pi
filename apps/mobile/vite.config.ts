import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Mobile watch client (ADR-0009 follow-up). A static Svelte PWA the phone loads
// over the tailnet; it talks to a master's relay (`/sessions`, `/tap`) directly.
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      // The vendored dot-matrix loader subsystem (copied from the desktop app)
      // imports its peers via `$lib/...` (the desktop's SvelteKit alias). Map
      // `$lib` at the vendored subsystem root so those imports resolve without
      // rewriting every file.
      $lib: fileURLToPath(new URL("./src/lib/dot-matrix", import.meta.url)),
    },
  },
  // host:true exposes the dev server on the LAN/tailnet for on-device testing.
  server: { host: true, port: 5180, strictPort: true },
});
