import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../electron/persistence/db.ts";
import { ThreadService } from "../../electron/services/thread-service.ts";
import type { ThreadFrame } from "@peach-pi/shared-types";

/**
 * Issue #14 — single subscribe seam for thread emissions. These tests assert
 * the seam itself without spawning Electron (no PiSession, no real agent):
 *   A) every frame kind reaches a registered subscriber,
 *   B) a second subscriber is registerable with one call (the 3rd-subscriber
 *      acceptance criterion — two here proves the fan-out is not 1:1),
 *   C) the disposer detaches a subscriber,
 *   D) the real internal emission paths (queueOps→flush for transcript,
 *      setStatus for status + idle) actually drive the seam, not just that
 *      emitFrame dispatches.
 *
 * The queue frame's only real call site is the per-session `onQueueChange`
 * lambda inside `ensureSession`, which requires a live PiSession; its dispatch
 * through the seam is covered by (A) via emitFrame directly. (#14)
 */

/** Build a ThreadService backed by an in-memory DB + a temp chats dir. No
 *  Electron, no PiSession — enough to exercise subscribe() + setStatus/flush. */
function makeService(): ThreadService {
  const db = openDb(":memory:");
  const chatsDir = mkdtempSync(join(tmpdir(), "peach-frame-"));
  // Emit is typed but unused here; a no-op satisfies the seam.
  const noEmit = (() => void 0) as unknown as Parameters<
    typeof ThreadService
  >[typeof ~nameofEmitPlaceholder];
  return new ThreadService(db, noEmit, () => void 0, chatsDir);
}

// `noEmit` above is awkward to type against the constructor's Emit; build it
// concretely instead. (Kept separate so the type stays out of makeService.)
function makeEmit(): unknown {
  return (() => void 0) as unknown;
}

const typeof = "emit" as const;
