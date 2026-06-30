import type {
  AppSnapshot,
  SnapshotCollectionPatch,
  SnapshotPatch,
} from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/** Read model of main-process state. Renderer never mutates it directly.
 *
 *  Identity is owned at the source: the main process diffs against what it
 *  last emitted and sends only changed entities on `event:snapshotPatch`, so
 *  unchanged refs survive by construction. The renderer never reconstructs
 *  identity field-by-field — the old `reconcile()` / `shallowEqualThread`
 *  compensator is gone. */
class SnapshotStore {
  current = $state<AppSnapshot | null>(null);

  async init(): Promise<void> {
    this.current = await api.invoke("app:getSnapshot");
    api.on("event:snapshotPatch", (patch) => this.applyPatch(patch));
  }

  /** Merge an entity-scoped patch over `current`. Each touched collection is
   *  rebuilt reusing existing refs for unchanged entities (main already
   *  guaranteed they weren't in `upserts`); `ui` is a field merge. */
  private applyPatch(patch: SnapshotPatch): void {
    const prev = this.current;
    if (!prev) return;
    const next: AppSnapshot = { ...prev };
    if (patch.threads) next.threads = applyCollection(prev.threads, patch.threads);
    if (patch.projects) next.projects = applyCollection(prev.projects, patch.projects);
    if (patch.worktrees) next.worktrees = applyCollection(prev.worktrees, patch.worktrees);
    if (patch.automations) next.automations = applyCollection(prev.automations, patch.automations);
    if (patch.ui) next.ui = { ...prev.ui, ...patch.ui };
    this.current = next;
  }
}

export const snapshot = new SnapshotStore();

/** Apply a collection patch: when `order` is present it is the authoritative
 *  new id sequence (a missing id was removed); otherwise upserts replace
 *  in-place preserving order. */
function applyCollection<T extends { id: string }>(
  prev: T[],
  patch: SnapshotCollectionPatch<T>,
): T[] {
  if (patch.order) {
    const byId = new Map(prev.map((e) => [e.id, e]));
    if (patch.upserts) {
      for (const [id, v] of Object.entries(patch.upserts)) byId.set(id, v);
    }
    const out: T[] = [];
    for (const id of patch.order) {
      const e = byId.get(id);
      if (e) out.push(e);
    }
    return out;
  }
  if (patch.upserts) {
    const up = patch.upserts;
    return prev.map((e) => up[e.id] ?? e);
  }
  return prev;
}
