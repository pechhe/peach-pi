import type { AppSnapshot, Thread } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/** Read model of main-process state. Renderer never mutates it directly. */
class SnapshotStore {
  current = $state<AppSnapshot | null>(null);

  /** Last-seen top-level arrays/objects keyed by id (where stable). When a
   *  fresh snapshot arrives, entries that are shallow-equal to the cached ref
   *  reuse the *existing* ref so Svelte's keyed `{#each}` and `$derived`
   *  comparisons skip reconciliation. The main process emits a full snapshot
   *  on every status flip; without this, every Thread object gets a new ref
   *  even when unchanged → sidebar rows + `selectedThread` churn on each
   *  transition. With it, only actually-changed threads invalidate. */
  private threadCache = new Map<string, Thread>();
  private prevThreads: Thread[] = [];
  private prevProjects: AppSnapshot["projects"] = [];
  private prevWorktrees: AppSnapshot["worktrees"] = [];
  private prevAutomations: AppSnapshot["automations"] = [];
  private prevUi: AppSnapshot["ui"] | null = null;

  async init(): Promise<void> {
    this.current = await api.invoke("app:getSnapshot");
    this.cacheCurrent();
    api.on("event:snapshot", (snapshot) => {
      this.current = this.reconcile(snapshot);
    });
  }

  private cacheCurrent(): void {
    if (!this.current) return;
    for (const t of this.current.threads) this.threadCache.set(t.id, t);
    this.prevThreads = this.current.threads;
    this.prevProjects = this.current.projects;
    this.prevWorktrees = this.current.worktrees;
    this.prevAutomations = this.current.automations;
    this.prevUi = this.current.ui;
  }

  /** Reuse existing refs for unchanged entries so downstream reactivity
   *  invalidates only for entries that actually changed. Returns a snapshot
   *  with stable identity for unchanged threads/projects/etc. */
  private reconcile(next: AppSnapshot): AppSnapshot {
    const threads: Thread[] = [];
    const seen = new Set<string>();
    for (const t of next.threads) {
      seen.add(t.id);
      const prev = this.threadCache.get(t.id);
      if (prev && shallowEqualThread(prev, t)) {
        threads.push(prev);
      } else {
        this.threadCache.set(t.id, t);
        threads.push(t);
      }
    }
    // Drop cached entries for threads no longer present (archived/deleted).
    for (const id of this.threadCache.keys()) {
      if (!seen.has(id)) this.threadCache.delete(id);
    }
    this.prevThreads = threads;
    this.prevProjects = shallowEqual(this.prevProjects, next.projects) ? this.prevProjects : next.projects;
    this.prevWorktrees = shallowEqual(this.prevWorktrees, next.worktrees) ? this.prevWorktrees : next.worktrees;
    this.prevAutomations = shallowEqual(this.prevAutomations, next.automations) ? this.prevAutomations : next.automations;
    this.prevUi = this.prevUi && shallowEqual(this.prevUi, next.ui) ? this.prevUi : next.ui;
    return {
      ...next,
      threads,
      projects: this.prevProjects,
      worktrees: this.prevWorktrees,
      automations: this.prevAutomations,
      ui: this.prevUi ?? next.ui,
    };
  }
}

export const snapshot = new SnapshotStore();

/** Shallow equal over arrays/primitives (used for projects/worktrees/ui which
 *  are comparatively small and change rarely). Threads get a dedicated
 *  comparator since they change most often and drive most invalidation. */
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object" && a && b) {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
    }
    return true;
  }
  return false;
}

/** Shallow field-by-field comparison for Thread. Reusing the ref when nothing
 *  changed is what stops the sidebar row + `selectedThread.find()` from
 *  re-invalidating on every full-snapshot emission. */
function shallowEqualThread(a: Thread, b: Thread): boolean {
  if (a === b) return true;
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  for (const k in rb) {
    if (ra[k] !== rb[k]) return false;
  }
  return true;
}
