import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", /^node:/],
      output: {
        // Sandboxed preload requires CJS.
        format: "cjs",
        entryFileNames: "[name].js",
      },
    },
  },
});
