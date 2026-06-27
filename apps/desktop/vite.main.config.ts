import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Baked at build time. Defaults to the project's Sentry DSN; override by
 *  setting SENTRY_DSN in the build environment (e.g. CI self-host). */
const SENTRY_DSN_DEFAULT =
  "https://c1ec9d64d48b4f36b7cb57ee9bd685e0@o4511113360310272.ingest.de.sentry.io/4511636424163408";

/**
 * Dev/validation: copy the compiled native capture binary next to the main
 * bundle so `RecordingService.captureBinPath()` (which looks under
 * `.vite/native/`) finds it. Build it first with
 * `pnpm --filter @peach-pi/record-replay build:native`.
 */
function copyCaptureBinary() {
  return {
    name: "peach-pi:copy-capture-binary",
    closeBundle() {
      const src = path.resolve(__dirname, "../../record-and-replay/native/capture");
      const destDir = path.resolve(__dirname, ".vite/native");
      const dest = path.join(destDir, "capture");
      if (!existsSync(src)) {
        console.warn(
          `[peach-pi] capture binary missing at ${src}. Run \`pnpm --filter @peach-pi/record-replay build:native\`.`,
        );
        return;
      }
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
      console.log(`[peach-pi] copied capture binary -> ${dest}`);
    },
  };
}

export default defineConfig({
  plugins: [copyCaptureBinary()],
  define: {
    // Baked into the main bundle. `process.env.SENTRY_DSN` read by
    // `initMainSentry` resolves at build time to this value (or an override
    // from the build environment).
    "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || SENTRY_DSN_DEFAULT),
  },
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
