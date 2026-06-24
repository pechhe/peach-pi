import type { RemoteSessionInfo } from "@peach-pi/shared-types";

/** A saved master connection. Mirrors `RemoteHostConnection` from shared-types,
 *  minus the desktop-only `id` semantics — we generate one per device. */
export interface Master {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
}

export type Reachability =
  | { state: "unknown" }
  | { state: "online"; at: number }
  | { state: "unreachable"; at: number };

/** Where we are in the navigation stack (a tiny hand-rolled router — no deps). */
export type Route =
  | { name: "masters" }
  | { name: "add-master" }
  | { name: "sessions"; masterId: string }
  | { name: "transcript"; masterId: string; threadId: string; title: string };

const MASTERS_KEY = "peach-remote.masters";
const seqKey = (masterId: string, threadId: string) =>
  `peach-remote.seq.${masterId}.${threadId}`;

function loadMasters(): Master[] {
  try {
    const raw = localStorage.getItem(MASTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Master[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class Store {
  masters = $state<Master[]>(loadMasters());
  /** Per-master reachability, refreshed by a `/health` probe. */
  reach = $state<Record<string, Reachability>>({});
  /** Cached `/sessions` per master. */
  sessions = $state<Record<string, RemoteSessionInfo[]>>({});
  /** Navigation stack; last entry is the visible screen. */
  stack = $state<Route[]>([{ name: "masters" }]);

  get route(): Route {
    return this.stack[this.stack.length - 1]!;
  }

  push(route: Route): void {
    this.stack = [...this.stack, route];
  }

  pop(): void {
    if (this.stack.length > 1) this.stack = this.stack.slice(0, -1);
  }

  master(id: string): Master | undefined {
    return this.masters.find((m) => m.id === id);
  }

  private persistMasters(): void {
    try {
      localStorage.setItem(MASTERS_KEY, JSON.stringify(this.masters));
    } catch {
      // Storage unavailable (private mode) — connections just won't persist.
    }
  }

  addMaster(input: Omit<Master, "id">): Master {
    const m: Master = { id: crypto.randomUUID(), ...input };
    this.masters = [...this.masters, m];
    this.persistMasters();
    return m;
  }

  removeMaster(id: string): void {
    this.masters = this.masters.filter((m) => m.id !== id);
    delete this.reach[id];
    delete this.sessions[id];
    this.persistMasters();
  }

  setReach(id: string, r: Reachability): void {
    this.reach = { ...this.reach, [id]: r };
  }

  setSessions(id: string, list: RemoteSessionInfo[]): void {
    this.sessions = { ...this.sessions, [id]: list };
  }

  /** Persisted tap watermark — survives a cold relaunch so reconnect can
   *  resume from `?lastSeq=` rather than re-streaming the whole transcript. */
  getSeq(masterId: string, threadId: string): number {
    const raw = localStorage.getItem(seqKey(masterId, threadId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  setSeq(masterId: string, threadId: string, seq: number): void {
    try {
      localStorage.setItem(seqKey(masterId, threadId), String(seq));
    } catch {
      // Non-fatal — reconnect just re-backfills from 0.
    }
  }
}

export const store = new Store();
