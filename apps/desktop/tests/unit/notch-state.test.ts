import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isNotchFinish,
  reduceInbox,
  computeNotchState,
} from "../../electron/services/notch-state.ts";
import type { ThreadId } from "@peach-pi/shared-types";

const id = (s: string) => s as ThreadId;

/**
 * The notch's routing/inbox logic is pure over (status transition, thread list,
 * unread set), mirroring `finish-cue.ts`. These cases lock ADR-0016's rules so
 * the SwiftUI helper never has to decide them.
 */

test("isNotchFinish: only a clean completed transition cues", () => {
  assert.equal(isNotchFinish("completed", "running"), true);
  assert.equal(isNotchFinish("completed", "idle"), true);
  // Already completed → no re-fire.
  assert.equal(isNotchFinish("completed", "completed"), false);
  // Non-completions never cue.
  assert.equal(isNotchFinish("failed", "running"), false);
  assert.equal(isNotchFinish("running", "idle"), false);
  assert.equal(isNotchFinish("idle", "completed"), false);
});

test("reduceInbox: a clean completion adds the thread as unread", () => {
  const next = reduceInbox(new Set(), id("a"), "completed", "running");
  assert.deepEqual([...next], ["a"]);
});

test("reduceInbox: a (re)start drops a previously-finished thread", () => {
  const next = reduceInbox(new Set([id("a")]), id("a"), "running", "completed");
  assert.deepEqual([...next], []);
});

test("reduceInbox: a failed run drops the thread from the inbox", () => {
  const next = reduceInbox(new Set([id("a")]), id("a"), "failed", "running");
  assert.deepEqual([...next], []);
});

test("reduceInbox: is pure (does not mutate the input set)", () => {
  const input = new Set([id("a")]);
  reduceInbox(input, id("b"), "completed", "running");
  assert.deepEqual([...input], ["a"]);
});

test("computeNotchState: running counts live; completed = unread that still exist", () => {
  const threads = [
    { id: id("a"), title: "Alpha", status: "running" as const },
    { id: id("b"), title: "Bravo", status: "completed" as const },
    { id: id("c"), title: "Cee", status: "idle" as const },
  ];
  const state = computeNotchState(threads, new Set([id("b")]));
  assert.equal(state.running, 1);
  assert.deepEqual(state.completed, [{ id: "b", title: "Bravo" }]);
  assert.equal(state.visible, true);
});

test("computeNotchState: drops unread ids whose thread no longer exists", () => {
  const threads = [{ id: id("a"), title: "Alpha", status: "idle" as const }];
  const state = computeNotchState(threads, new Set([id("gone")]));
  assert.deepEqual(state.completed, []);
  assert.equal(state.running, 0);
  assert.equal(state.visible, false);
});

test("computeNotchState: nothing running and nothing unread → not visible", () => {
  const threads = [{ id: id("a"), title: "Alpha", status: "idle" as const }];
  assert.equal(computeNotchState(threads, new Set()).visible, false);
});
