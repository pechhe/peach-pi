import type { RemoteProjectInfo, RemoteSessionInfo } from "@peach-pi/shared-types";

/** A saved master connection. Mirrors `RemoteHostConnection` from shared-types,
 *  minus the desktop-only `id` semantics — we generate one per device. */
export interface Master {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
}

/** Display label for a master's endpoint. A full URL (Tailscale Serve) shows as
 *  entered; a bare host shows `host:port`. Avoids a stray ":0" for URL hosts. */
export function hostLabel(m: Pick<Master, "host" | "port">): string {
  const host = m.host.trim();
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
  return m.port ? `${host}:${m.port}` : host;
}

type Reachability =
  | { state: "unknown" }
  | { state: "online"; at: number }
  | { state: "unreachable"; at: number };

/** Where we are in the navigation stack (a tiny hand-rolled router — no deps). */
type Route =
  | { name: "masters" }
  | { name: "add-master" }
  | { name: "sessions"; masterId: string }
  | { name: "new-thread"; masterId: string }
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
  /** Cached `/projects` per master (for the new-thread picker). */
  projects = $state<Record<string, RemoteProjectInfo[]>>({});
  /** Navigation stack; last entry is the visible screen. */
  stack = $state<Route[]>([{ name: "masters" }]);
  /** Last navigation direction — drives forward/backward slide transitions. */
  dir = $state<"forward" | "backward">("forward");

  get route(): Route {
    return this.stack[this.stack.length - 1]!;
  }

  push(route: Route): void {
    this.dir = "forward";
    this.stack = [...this.stack, route];
    // Mirror the in-app stack into browser history so the Android hardware /
    // browser back button pops a screen instead of exiting the PWA.
    history.pushState({ depth: this.stack.length }, "");
  }

  /** In-app back (chevron / edge swipe). Routes through the browser history so
   *  the history stack and nav stack stay aligned — `popstate` does the pop. */
  pop(): void {
    if (this.stack.length > 1) history.back();
  }

  /** Fold a `popstate` back into the nav stack. `state.depth` was written by
   *  push(); the initial entry has no state (depth 1). Forward navigations
   *  (depth beyond the stack) are ignored — the app can't reconstruct them. */
  handlePopState(state: unknown): void {
    const depth = (state as { depth?: number } | null)?.depth ?? 1;
    if (depth < this.stack.length) {
      this.dir = "backward";
      this.stack = this.stack.slice(0, Math.max(1, depth));
    }
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

  /** Add or update a master keyed by host (so re-scanning a QR refreshes the
   *  token/name instead of duplicating the connection). */
  upsertByHost(input: Omit<Master, "id">): Master {
    const existing = this.masters.find((m) => m.host === input.host);
    if (existing) {
      const updated = { ...existing, ...input };
      this.masters = this.masters.map((m) => (m.id === existing.id ? updated : m));
      this.persistMasters();
      return updated;
    }
    return this.addMaster(input);
  }

  /** Parse a connect deep link (`https://watch-app/?pair=1&name=&host=&token=`
   *  or the legacy `#connect?…` fragment) into a master input, or null when the
   *  link is missing host/token. Shared by the launch deep link and the paste
   *  field on AddMaster. */
  parseConnectLink(raw: string): Omit<Master, "id"> | null {
    let p: URLSearchParams | null = null;
    try {
      const u = new URL(raw);
      p = u.searchParams.get("pair") === "1" ? u.searchParams : null;
      if (!p) {
        const m = (u.hash || "").match(/^#connect\?(.*)$/);
        if (m) p = new URLSearchParams(m[1]);
      }
    } catch {
      return null;
    }
    if (!p) return null;
    const host = (p.get("host") ?? "").trim();
    const token = (p.get("token") ?? "").trim();
    const name = (p.get("name") ?? host).trim() || host;
    if (!host || !token) return null;
    return { name, host, port: 0, token };
  }

  /** Add a master from a pasted connect link (the same payload a QR scan
   *  delivers via the launch deep link). Returns the saved master, or null if
   *  the link isn't a valid connect link. */
  addFromConnectLink(raw: string): Master | null {
    const input = this.parseConnectLink(raw);
    if (!input) return null;
    return this.upsertByHost(input);
  }

  /** If launched via a `?pair=1&host=&token=&name=` deep link (QR pairing on
   *  the desktop), fold it into a saved master and jump to its sessions. The
   *  query is cleared immediately so the token doesn't linger in the URL bar or
   *  browser history. Also accepts the legacy `#connect?…` fragment form.
   *  Returns true when a link was consumed. */
  consumeConnectLink(): boolean {
    const search = new URLSearchParams(location.search);
    let p: URLSearchParams | null = search.get("pair") === "1" ? search : null;
    if (!p) {
      const m = (location.hash || "").match(/^#connect\?(.*)$/);
      if (m) p = new URLSearchParams(m[1]);
    }
    // Strip both query and hash so the token isn't left in the address bar.
    history.replaceState(null, "", location.pathname);
    if (!p) return false;
    const host = (p.get("host") ?? "").trim();
    const token = (p.get("token") ?? "").trim();
    const name = (p.get("name") ?? host).trim() || host;
    if (!host || !token) return false;
    const master = this.upsertByHost({ name, host, port: 0, token });
    this.stack = [{ name: "masters" }, { name: "sessions", masterId: master.id }];
    // Keep browser history aligned with the two-deep stack so back → masters.
    history.pushState({ depth: 2 }, "");
    return true;
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

  setProjects(id: string, list: RemoteProjectInfo[]): void {
    this.projects = { ...this.projects, [id]: list };
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
