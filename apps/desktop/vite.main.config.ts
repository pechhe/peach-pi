import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // pi SDK stays external: it loads extensions/resources at runtime
      // and must not be inlined into the main bundle.
      external: ["electron", /^node:/, /^@earendil-works\//],
    },
  },
  resolve: {
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
});
