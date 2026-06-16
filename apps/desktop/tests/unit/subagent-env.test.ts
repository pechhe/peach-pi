import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { shellQuote } from "../../electron/services/subagent-service.ts";

/**
 * Regression: the macOS userData dir is always under
 * "~/Library/Application Support/<App Name>/" — two spaces. The pi-subagents
 * extension parses PI_SUBAGENT_PI_COMMAND as a shell-style command string, so
 * an unquoted wrapper path splits on those spaces and spawn() fails with
 * ENOENT (spawn /Users/.../Library/Application). shellQuote must make the path
 * round-trip through a shell as a single argument.
 */
function shellResolvesToSingleArg(p: string): string {
  // printf %s emits only the first argument; if quoting is wrong, the shell
  // would word-split `p` and printf would receive several args.
  return execSync(`printf %s ${shellQuote(p)}`, { encoding: "utf8" });
}

test("shellQuote round-trips a userData path with spaces", () => {
  const p = "/Users/admin/Library/Application Support/Peach Pi/pi-wrapper.sh";
  assert.equal(shellResolvesToSingleArg(p), p);
});

test("shellQuote round-trips paths with single quotes", () => {
  const p = "/tmp/it's a test/pi-wrapper.sh";
  assert.equal(shellResolvesToSingleArg(p), p);
});
