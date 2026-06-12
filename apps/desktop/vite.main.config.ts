import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // pi SDK stays external: it loads extensions/resources at runtime
      // and must not be inlined into the main bundle.
      // node-pty: native module, also external + vendored.
      external: ["electron", "node-pty", /^node:/, /^@earendil-works\//],
    },
  },
  resolve: {
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
});
