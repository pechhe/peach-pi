import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../../electron/persistence/db.ts";
import { AppService } from "../../electron/services/app-service.ts";
import { ThreadRepo } from "../../electron/persistence/repositories.ts";
import type { Emit } from "../../electron/ipc/registry.ts";
import type { SnapshotPatch } from "@peach-pi/shared-types";

/** Flush the 0-ms coalesce timer AppService.notify() schedules. */
const flush = () => new Promise<void>((r) => setTimeout(r, 5));

function makeService() {
  const db = openDb(":memory:");
  const emitted: { channel: string; payload: SnapshotPatch }[] = [];
  const emit: Emit = ((channel: string, payload: SnapshotPatch) => {
    emitted.push({ channel, payload });
  }) as never;
  const app = new AppService(db, emit);
  // ThreadRepo shares the same in-memory connection so we can seed a thread
  // without going through ThreadService (which would own notify() itself).
  const threads = new ThreadRepo(db);
  return { app, threads, emitted };
}

test("first notify emits a full-replacement event:snapshotPatch", async () => {
  const { app, threads, emitted } = makeService();
  threads.insert({ projectId: null, title: "T1" });
  app.addProject(mkdtempSync(path.join(tmpdir(), "pp-patch-")));
  await flush();

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!.channel, "event:snapshotPatch");
  const patch = emitted[0]!.payload;
  // Full replacement: every collection carries upserts + order, plus full ui.
  assert.ok(patch.projects?.upserts && patch.projects.order);
  assert.ok(patch.threads?.upserts && patch.threads.order);
  assert.ok(patch.worktrees?.upserts && patch.worktrees.order);
  assert.ok(patch.automations?.upserts && patch.automations.order);
  assert.ok(patch.ui);
  assert.ok(patch.threads!.order!.length === 1);
});

test("subsequent patches carry only changed entities (identity at the source)", async () => {
  const { app, threads, emitted } = makeService();
  const t1 = threads.insert({ projectId: null, title: "T1" })!;
  app.addProject(mkdtempSync(path.join(tmpdir(), "pp-patch-")));
  await flush(); // consume the full-replacement first emit
  emitted.length = 0;

  // Add a second project. p1 must NOT be in upserts (unchanged) — its ref
  // is reused at the source, so the renderer never sees a new ref for it.
  const p2 = app.addProject(mkdtempSync(path.join(tmpdir(), "pp-patch-")));
  await flush();

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!.channel, "event:snapshotPatch");
  const projPatch = emitted[0]!.payload.projects;
  assert.ok(projPatch, "projects patch present");
  assert.ok(projPatch!.upserts, "projects upserts present");
  assert.ok(Object.keys(projPatch!.upserts!).includes(p2.id));
  // p2 is the only upsert; the pre-existing project is NOT re-sent.
  assert.equal(Object.keys(projPatch!.upserts!).length, 1);
  // No threads/ui change → those keys are absent.
  assert.equal(emitted[0]!.payload.threads, undefined);
  assert.equal(emitted[0]!.payload.ui, undefined);

  // Now flip a thread field (snooze). Only that thread is upserted; order is
  // unchanged (no id added/removed/reordered) so `order` is omitted.
  emitted.length = 0;
  app.snoozeThread(t1.id, "2099-01-01T00:00:00Z");
  await flush();

  assert.equal(emitted.length, 1);
  const tPatch = emitted[0]!.payload.threads;
  assert.ok(tPatch?.upserts, "threads upserts present");
  assert.deepEqual(Object.keys(tPatch!.upserts!), [t1.id]);
  assert.equal(tPatch!.order, undefined, "order omitted when id sequence unchanged");
  assert.equal(emitted[0]!.payload.projects, undefined);
  assert.equal(emitted[0]!.payload.ui, undefined);
});

test("ui-only mutation emits a ui field merge, no collection patches", async () => {
  const { app, emitted } = makeService();
  app.addProject(mkdtempSync(path.join(tmpdir(), "pp-patch-")));
  await flush();
  emitted.length = 0;

  app.setSidebarWidth(320);
  await flush();

  assert.equal(emitted.length, 1);
  const patch = emitted[0]!.payload;
  assert.ok(patch.ui, "ui patch present");
  assert.equal(patch.ui!.sidebarWidth, 320);
  // No entity collection touched.
  assert.equal(patch.threads, undefined);
  assert.equal(patch.projects, undefined);
  assert.equal(patch.worktrees, undefined);
  assert.equal(patch.automations, undefined);
});
