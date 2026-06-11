import { defineConfig } from "@playwright/test";

// Lane conventions carried over from peche-pi (tests/AGENTS.md):
// core = background-safe UI flows; live = real providers; native = macOS
// surfaces; production = packaged app. Phase 0 ships core only.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
