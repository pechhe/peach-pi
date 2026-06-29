import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withDefaultTimeout,
  DEFAULT_BASH_TIMEOUT_S,
} from "../src/bash-override.ts";
import type { BashOperations } from "@earendil-works/pi-coding-agent";

/** Records the opts each exec() was called with and never resolves, so
 *  callers can assert the timeout was injected without any real spawn. */
function recordingOps(fixedExit?: number): BashOperations & {
  calls: Array<{ timeout?: number }>;
} {
  const calls: Array<{ timeout?: number }> = [];
  return {
    calls,
    exec: (_command, _cwd, opts) => {
      calls.push({ timeout: opts.timeout });
      return Promise.resolve({ exitCode: fixedExit ?? 0 });
    },
  };
}

test("withDefaultTimeout applies the default when no timeout given", async () => {
  const ops = recordingOps();
  const wrapped = withDefaultTimeout(ops, 123);
  await wrapped.exec("ls", "/tmp", { onData: () => {} });
  assert.equal(ops.calls[0]?.timeout, 123);
});

test("withDefaultTimeout applies the default when timeout is 0", async () => {
  const ops = recordingOps();
  const wrapped = withDefaultTimeout(ops, 123);
  await wrapped.exec("ls", "/tmp", { onData: () => {}, timeout: 0 });
  assert.equal(ops.calls[0]?.timeout, 123);
});

test("withDefaultTimeout does NOT clobber an explicit agent timeout", async () => {
  const ops = recordingOps();
  const wrapped = withDefaultTimeout(ops, 123);
  await wrapped.exec("ls", "/tmp", { onData: () => {}, timeout: 30 });
  assert.equal(ops.calls[0]?.timeout, 30);
});

test("default constant is 600s (10 min)", () => {
  assert.equal(DEFAULT_BASH_TIMEOUT_S, 600);
});
