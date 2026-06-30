import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClipContext } from "../../electron/services/clip-artifact.ts";
import type { RecordEvent } from "@peach-pi/record-replay/src/types.ts";

function ev(t: number, type: string, payload: unknown): RecordEvent {
  return { t, ts: "", type, payload } as RecordEvent;
}

test("buildClipContext maps screenshots to frames and window-activate to chapters", () => {
  const events = [
    ev(0, "window", { action: "activate", window: "Safari" }),
    ev(500, "screenshot", { path: "/tmp/a.png", trigger: "click", index: 1 }),
    ev(2000, "screenshot", { path: "/tmp/b.png", trigger: "focus", index: 2 }),
    ev(3000, "window", { action: "activate", window: "Notes" }),
  ];
  const ctx = buildClipContext("c1", events, 3200, "2026-01-01T00:00:00Z");

  assert.equal(ctx.frames.length, 2);
  assert.deepEqual(ctx.frames[0], { atMs: 500, path: "frames/500.png", label: "click" });
  assert.deepEqual(ctx.frames[1], { atMs: 2000, path: "frames/2000.png", label: "focus" });
  assert.deepEqual(
    ctx.chapters.map((c) => c.title),
    ["Safari", "Notes"],
  );
  assert.equal(ctx.durationMs, 3200);
  assert.equal(ctx.transcript.status, "pending");
  assert.equal(ctx.transcript.path, null);
  assert.equal(ctx.title, null);
});

test("buildClipContext dedupes consecutive identical chapter titles", () => {
  const events = [
    ev(0, "window", { action: "activate", window: "Safari" }),
    ev(100, "window", { action: "activate", window: "Safari" }),
    ev(200, "window", { action: "deactivate", window: "Safari" }),
  ];
  const ctx = buildClipContext("c", events, 200, "");
  assert.equal(ctx.chapters.length, 1);
  assert.equal(ctx.frames.length, 0);
});
