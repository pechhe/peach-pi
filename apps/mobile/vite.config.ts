import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// Mobile watch client (ADR-0009 follow-up). A static Svelte PWA the phone loads
// over the tailnet; it talks to a master's relay (`/sessions`, `/tap`) directly.
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // host:true exposes the dev server on the LAN/tailnet for on-device testing.
  server: { host: true, port: 5180, strictPort: true },
});
