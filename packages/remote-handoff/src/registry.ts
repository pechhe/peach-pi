import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HandoffThread, Machine } from "./types.ts";

/**
 * Local thread + machine registry, JSON-backed for MVP portability.
 *
 * Each machine keeps its OWN local registry — there is no shared registry
 * over the wire. The two registries converge through git (the thread branch
 * is the shared, checkoutable source of truth for the work) and through
 * transport calls (status/logs/checkpoint RPC). This keeps the model
 * decentralised: no machine is a fixed master.
 *
 * JSON is chosen over SQLite deliberately: the host `peach` CLI must run on
 * any laptop's Node without a native sqlite build. The repo's desktop app
 * uses `node:sqlite` (ADR-0001); swapping this registry to the same
 * `DatabaseSync` seam later is a one-file change (see docs/remote-handoff.md).
 *
 * `~/.peach` is the peach state root (the repo keeps pi integration config
 * under `~/.pi/agent`; movable execution is a distinct subsystem).
 */

/** The on-disk shape of the two JSON files. */
interface ThreadsFile {
  threads: HandoffThread[];
}
interface MachinesFile {
  machines: Machine[];
  /** The machine id this host identifies as (matches one in `machines`). */
  selfId: string | null;
}

export const DEFAULT_ROOT = join(homedir(), ".peach");

/** Pure: merge a patch into a thread, stamping `updatedAt`. */
export function patchThread(
  t: HandoffThread,
  patch: Partial<HandoffThread>,
  now: Date,
): HandoffThread {
  return { ...t, ...patch, updatedAt: now.toISOString() };
}

export class Registry {
  private threadsFile: string;
  private machinesFile: string;
  private threadsCache: HandoffThread[] | null = null;
  private machinesCache: MachinesFile | null = null;
  private root: string;

  constructor(root: string = DEFAULT_ROOT) {
    this.root = root;
    this.threadsFile = join(root, "threads.json");
    this.machinesFile = join(root, "machines.json");
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(join(this.root, "workspaces"), { recursive: true });
    await mkdir(join(this.root, "logs"), { recursive: true });
  }

  // ── threads ────────────────────────────────────────────────────────

  async loadThreads(): Promise<HandoffThread[]> {
    if (this.threadsCache) return [...this.threadsCache];
    try {
      const raw = await readFile(this.threadsFile, "utf8");
      this.threadsCache = (JSON.parse(raw) as ThreadsFile).threads ?? [];
    } catch {
      this.threadsCache = [];
    }
    return [...this.threadsCache!];
  }

  private async saveThreads(threads: HandoffThread[]): Promise<void> {
    await this.ensureRoot();
    this.threadsCache = threads;
    await writeFile(this.threadsFile, JSON.stringify({ threads }, null, 2), "utf8");
  }

  async getThread(id: string): Promise<HandoffThread | null> {
    return (await this.loadThreads()).find((t) => t.id === id) ?? null;
  }

  /** Insert a new thread; throws if the id already exists. */
  async addThread(thread: HandoffThread): Promise<HandoffThread> {
    const threads = await this.loadThreads();
    if (threads.some((t) => t.id === thread.id))
      throw new Error(`thread already exists: ${thread.id}`);
    if (threads.some((t) => t.branch === thread.branch))
      throw new Error(`branch already registered: ${thread.branch}`);
    threads.push(thread);
    await this.saveThreads(threads);
    return thread;
  }

  /** Apply a patch to a thread (stamps `updatedAt`); throws if missing. */
  async updateThread(
    id: string,
    patch: Partial<HandoffThread>,
    now: Date,
  ): Promise<HandoffThread> {
    const threads = await this.loadThreads();
    const idx = threads.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`unknown thread: ${id}`);
    const updated = patchThread(threads[idx]!, patch, now);
    threads[idx] = updated;
    await this.saveThreads(threads);
    return updated;
  }

  /** Replace a thread wholesale (used after transport round-trips). */
  async putThread(thread: HandoffThread): Promise<HandoffThread> {
    const threads = await this.loadThreads();
    const idx = threads.findIndex((t) => t.id === thread.id);
    if (idx < 0) threads.push(thread);
    else threads[idx] = thread;
    await this.saveThreads(threads);
    return thread;
  }

  async removeThread(id: string): Promise<void> {
    const threads = (await this.loadThreads()).filter((t) => t.id !== id);
    await this.saveThreads(threads);
  }

  // ── machines ───────────────────────────────────────────────────────

  async loadMachines(): Promise<Machine[]> {
    return (await this.loadMachinesFile()).machines;
  }

  private async loadMachinesFile(): Promise<MachinesFile> {
    if (this.machinesCache) return this.machinesCache;
    try {
      const raw = await readFile(this.machinesFile, "utf8");
      this.machinesCache = JSON.parse(raw) as MachinesFile;
    } catch {
      this.machinesCache = { machines: [], selfId: null };
    }
    return this.machinesCache;
  }

  private async saveMachinesFile(file: MachinesFile): Promise<void> {
    await this.ensureRoot();
    this.machinesCache = file;
    await writeFile(this.machinesFile, JSON.stringify(file, null, 2), "utf8");
  }

  async selfId(): Promise<string | null> {
    return (await this.loadMachinesFile()).selfId;
  }

  async setSelf(machine: Machine): Promise<Machine> {
    const file = await this.loadMachinesFile();
    const idx = file.machines.findIndex((m) => m.id === machine.id);
    if (idx < 0) file.machines.push(machine);
    else file.machines[idx] = machine;
    file.selfId = machine.id;
    await this.saveMachinesFile(file);
    return machine;
  }

  async getMachine(id: string): Promise<Machine | null> {
    return (await this.loadMachines()).find((m) => m.id === id) ?? null;
  }

  async machineByName(name: string): Promise<Machine | null> {
    return (await this.loadMachines()).find((m) => m.name === name) ?? null;
  }

  async self(): Promise<Machine> {
    const file = await this.loadMachinesFile();
    if (file.selfId) {
      const m = file.machines.find((x) => x.id === file.selfId);
      if (m) return m;
    }
    // Fall back to a self-registered default machine so the CLI works before
    // the user has run `peach machine add`.
    const fallback: Machine = {
      id: `m_${machineSlug(process.env.PEACH_MACHINE || "local")}`,
      name: process.env.PEACH_MACHINE || "local",
      role: "local",
      repoPath: process.cwd(),
      workspaceRoot: join(this.root, "workspaces"),
      onlineStatus: "online",
      lastSeenAt: new Date().toISOString(),
      sshHost: null,
    };
    return this.setSelf(fallback);
  }

  async upsertMachine(machine: Machine): Promise<Machine> {
    const file = await this.loadMachinesFile();
    const idx = file.machines.findIndex((m) => m.id === machine.id);
    if (idx < 0) file.machines.push(machine);
    else file.machines[idx] = machine;
    await this.saveMachinesFile(file);
    return machine;
  }
}

/** Slug used for machine ids (short, filesystem/git-safe). */
export function machineSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "machine"
  );
}
