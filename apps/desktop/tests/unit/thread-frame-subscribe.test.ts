import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../electron/persistence/db.ts";
import { ThreadService } from "../../electron/services/thread-service.ts";
import type { Emit } from "../../electron/ipc/registry.ts";
import type { ThreadFrame } from "@peach-pi/shared-types";

/**
 * Issue #14 — single subscribe seam for thread emissions.
 *
 * Coverage (no Electron, no PiSession):
 *   - the full frame stream (all 4 kinds, one per emission path) reaches a
 *     registered subscriber,
 *   - a second subscriber is registered with one call and fans out (the
 *     3rd-subscriber acceptance criterion — proving the seam is not 1:1),
 *   - the disposer detaches exactly one subscriber.
 *
 * The four real emission sites — `flush()` (transcript), `setStatus()`
 * (status + idle), and the per-session `onQueueChange` lambda (queue) — all
 * funnel through `ThreadService.emitFrame`, so driving that one path exercises
 * the seam every production site uses. `emitFrame` is private; the test reaches
 * it through a double cast (kept here, not in production code) so the frame
 * stream can be asserted without spawning a real PiSession (the queue frame's
 * only production call site lives inside `ensureSession`).
 */

/** Construct a ThreadService over an in-memory DB + temp chats dir. The emit
 *  no-op mirrors handoff-service.test.ts; nothing reaches the renderer here. */
function makeService(): ThreadService {
  const db = openDb(":memory:");
  const chatsDir = mkdtempSync(join(tmpdir(), "peach-frame-"));
  const noEmit = (() => void 0) as unknown as Emit;
  return new ThreadService(db, noEmit, () => void 0, chatsDir);
}

/** Reach the private emit counterpart to `subscribe` for the test only. */
function emit(svc: ThreadService, frame: ThreadFrame): void {
  (svc as unknown as { emitFrame(f: ThreadFrame): void }).emitFrame(frame);
}

/** Collect frames from a subscription into an array for assertion. */
function tap(svc: ThreadService): { frames: ThreadFrame[]; off: () => void } {
  const frames: ThreadFrame[] = [];
  const off = svc.subscribe((f) => frames.push(f));
  return { frames, off };
}

test("subscribe: the full frame stream (transcript, status, queue, idle) reaches a subscriber", () => {
  const svc = makeService();
  const { frames } = tap(svc);

  emit(svc, { kind: "transcript", threadId: "t1", ops: [], seq: 1 });
  emit(svc, { kind: "status", threadId: "t1", status: "running" });
  emit(svc, { kind: "queue", threadId: "t1", steering: ["fix bug"], followUp: [] });
  emit(svc, { kind: "idle", threadId: "t1", cwd: "/repo" });

  assert.equal(frames.length, 4);
  assert.deepEqual(frames[0], { kind: "transcript", threadId: "t1", ops: [], seq: 1 });
  assert.deepEqual(frames[1], { kind: "status", threadId: "t1", status: "running" });
  assert.deepEqual(frames[2], {
    kind: "queue",
    threadId: "t1",
    steering: ["fix bug"],
    followUp: [],
  });
  assert.deepEqual(frames[3], { kind: "idle", threadId: "t1", cwd: "/repo" });
});

test("subscribe: a second subscriber fans out from the same emit (3rd-subscriber criterion)", () => {
  const svc = makeService();
  const a: ThreadFrame[] = [];
  const b: ThreadFrame[] = [];
  svc.subscribe((f) => a.push(f));
  svc.subscribe((f) => b.push(f));

  emit(svc, { kind: "status", threadId: "t2", status: "running" });
  emit(svc, { kind: "transcript", threadId: "t2", ops: [], seq: 5 });

  assert.deepEqual(a, [
    { kind: "status", threadId: "t2", status: "running" },
    { kind: "transcript", threadId: "t2", ops: [], seq: 5 },
  ]);
  assert.deepEqual(b, a, "second subscriber received the identical stream");
});

test("subscribe: disposer detaches exactly one subscriber", () => {
  const svc = makeService();
  const a: ThreadFrame[] = [];
  const b: ThreadFrame[] = [];
  svc.subscribe((f) => a.push(f));
  const off = svc.subscribe((f) => b.push(f));

  emit(svc, { kind: "status", threadId: "t3", status: "running" });
  off();
  emit(svc, { kind: "idle", threadId: "t3", cwd: null });

  // A received both frames; B stopped after the disposer fired.
  assert.equal(a.length, 2);
  assert.equal(b.length, 1);
  assert.deepEqual(b[0], { kind: "status", threadId: "t3", status: "running" });
});
