import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalCustomDriver, type TerminalCustomFrameEvent } from "../src/terminal-custom.ts";

/** A fake pi `custom()` component: renders its label + last keystroke. */
function fakeFactory(label: string, onDone?: (done: (r: unknown) => void) => void) {
  return (_tui: unknown, _theme: unknown, _kb: unknown, done: (r: unknown) => void) => {
    let last = "";
    onDone?.(done);
    return {
      render: (_w: number) => [label, `last:${last}`],
      handleInput: (data: string) => {
        last = data;
      },
      dispose: () => {},
    };
  };
}

test("renders the first frame when a component is driven", async () => {
  const frames: TerminalCustomFrameEvent[] = [];
  const driver = new TerminalCustomDriver((f) => frames.push(f));
  void driver.drive(fakeFactory("hello"));
  await Promise.resolve();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0]!.lines, ["hello", "last:"]);
  assert.equal(frames[0]!.busy, undefined);
});

test("input re-renders with the keystroke", async () => {
  const frames: TerminalCustomFrameEvent[] = [];
  const driver = new TerminalCustomDriver((f) => frames.push(f));
  void driver.drive(fakeFactory("hi"));
  await Promise.resolve();
  const requestId = frames[0]!.requestId;
  driver.input(requestId, "x");
  assert.deepEqual(frames.at(-1)!.lines, ["hi", "last:x"]);
});

test("done() settles the promise and emits a busy frame", async () => {
  const frames: TerminalCustomFrameEvent[] = [];
  let doneFn: ((r: unknown) => void) | undefined;
  const driver = new TerminalCustomDriver((f) => frames.push(f));
  const p = driver.drive(fakeFactory("step1", (d) => (doneFn = d)));
  await Promise.resolve();
  doneFn!("result");
  assert.equal(await p, "result");
  const busy = frames.at(-1)!;
  assert.equal(busy.busy, true);
  // A settled component ignores further input (no new frame).
  const before = frames.length;
  driver.input(busy.requestId, "y");
  assert.equal(frames.length, before);
});

test("cancel() settles the promise with undefined", async () => {
  const frames: TerminalCustomFrameEvent[] = [];
  const driver = new TerminalCustomDriver((f) => frames.push(f));
  const p = driver.drive(fakeFactory("x"));
  await Promise.resolve();
  driver.cancel(frames[0]!.requestId);
  assert.equal(await p, undefined);
});

test("close() settles all live components and emits a closed frame", async () => {
  const frames: TerminalCustomFrameEvent[] = [];
  const driver = new TerminalCustomDriver((f) => frames.push(f));
  const p = driver.drive(fakeFactory("x"));
  await Promise.resolve();
  driver.close();
  assert.equal(await p, undefined);
  assert.equal(frames.at(-1)!.closed, true);
});
