import { homedir } from "node:os";
import { join } from "node:path";
import type {
  RemoteFirstMode,
  ThreadHandoffStatus,
  ThreadId,
  TypedEmit,
} from "@peach-pi/shared-types";
import type { AppDb } from "../../persistence/db.ts";
import { KvRepo } from "../../persistence/repositories.ts";
import {
  HandoffService,
  LocalTransport,
  SshTransport,
  type Machine,
} from "@peach-pi/remote-handoff";

/**
 * Typed broadcast emitter (channel → payload, keyed by the IPC contract).
 * Imported from shared-types rather than declared locally: it is a pure type
 * (erased at runtime) so it pulls no `electron` dependency, preserving plain-
 * Node loadability for unit tests. The concrete factory lives in
 * `ipc/registry.ts` (it needs `BrowserWindow.webContents.send` at runtime).
 */
export type Emit = TypedEmit;

/**
 * Remote-first mode + per-thread movable execution, layered on the
 * `@peach-pi/remote-handoff` package (see docs/remote-handoff.md).
 *
 * This is the Electron-side binding: it owns a `kv`-backed boolean flag and a
 * `HandoffService` instance. It is deliberately separate from ADR-0009's
 * `RemoteHostService` (session hosting over the tailnet relay): remote-first
 * mode is the user-facing "send this thread to my other laptop" toggle, not
 * a served-session model.
 *
 * Message → handoff: when remote-first is on and the user messages a thread,
 * `ensureRemoteForThread` creates (or reuses) a `HandoffThread` keyed to the
 * conversation thread and hands it to the configured remote machine via the
 * package's `send`. The conversation content (pi session) still runs on the
 * controller for MVP; the *work* (branch + checkout) is what moves. Truly
 * relaying the prompt to a remote pi process is a documented future step.
 *
 * State lives under `~/.peach/` (the package's default root).
 */

const MODE_KEY = "remote-first-mode";
const TARGET_KEY = "remote-first-target";
const MAPPING_KEY = "remote-handoff-mapping";

/** Persisted shape: just the boolean + chosen target machine name. */
interface PersistedMode {
  enabled: boolean;
  targetMachine: string | null;
}

export class HandoffAppService {
  private engine: HandoffService;
  private kv: KvRepo;
  private emit: Emit;
  /** The remote machine name threads are sent to (null = first remote found). */
  private targetMachine: string | null = null;

  constructor(
    kv: KvRepo,
    emit: Emit,
    root: string,
  ) {
    this.kv = kv;
    this.emit = emit;
    // SSH transport for real cross-machine handoff; the engine falls back to
    // LocalTransport behaviour when the peer turns out to be this machine.
    // repoPath is the app's cwd only so HandoffService.self() can synthesize a
    // local machine record without throwing — real git ops run on the *remote*
    // peer (target.repoPath), never here, since this machine is the controller.
    this.engine = new HandoffService({
      root,
      repoPath: process.cwd(),
      transport: new SshTransport(),
      machineName: "local",
    });
    const persisted = this.kv.get<PersistedMode>(MODE_KEY);
    this.targetMachine = persisted?.targetMachine ?? null;
  }

  // ── mode ───────────────────────────────────────────────────────────

  async getMode(): Promise<RemoteFirstMode> {
    const persisted = this.kv.get<PersistedMode>(MODE_KEY) ?? {
      enabled: false,
      targetMachine: null,
    };
    const machines = await this.engine.listMachines();
    const self = await this.engine.getRegistry().self();
    const hasRemote = machines.some((m) => m.id !== self.id && (m.sshHost ?? null) !== null);
    return {
      enabled: persisted.enabled,
      targetMachine: persisted.targetMachine,
      hasRemoteMachine: hasRemote,
    };
  }

  async setMode(enabled: boolean): Promise<RemoteFirstMode> {
    const prev = this.kv.get<PersistedMode>(MODE_KEY) ?? { enabled: false, targetMachine: null };
    const next: PersistedMode = { enabled, targetMachine: prev.targetMachine ?? this.targetMachine };
    this.kv.set(MODE_KEY, next);
    this.emit("event:handoffChanged", undefined);
    return this.getMode();
  }

  /** The machine name to hand threads to (null = "first remote configured"). */
  getTargetMachine(): string | null {
    return this.targetMachine;
  }

  async setTargetMachine(name: string | null): Promise<void> {
    this.targetMachine = name;
    const prev = this.kv.get<PersistedMode>(MODE_KEY) ?? { enabled: false, targetMachine: null };
    this.kv.set(MODE_KEY, { ...prev, targetMachine: name });
    this.emit("event:handoffChanged", undefined);
  }

  /** Register/update a peer machine so remote-first has a target. */
  async registerMachine(input: {
    name: string;
    sshHost: string | null;
    repoPath?: string | null;
  }): Promise<void> {
    await this.engine.addMachine(input);
    // First registration seeds the target so the toggle is immediately useful.
    if (!this.targetMachine) await this.setTargetMachine(input.name);
    else this.emit("event:handoffChanged", undefined);
  }

  // ── thread handoff ─────────────────────────────────────────────────

  /**
   * Ensure the conversation thread `id` has a remote handoff thread, and hand
   * it to the target machine. Idempotent: a thread already running remotely is
   * a no-op. Returns the handoff status for the renderer. Called from
   * `threadService.prompt` when remote-first mode is on.
   */
  async ensureRemoteForThread(id: ThreadId, task: string): Promise<ThreadHandoffStatus> {
    const mode = await this.getMode();
    if (!mode.enabled || !mode.hasRemoteMachine) return this.statusForThread(id);
    const target = await this.resolveTarget();
    if (!target) return this.statusForThread(id);

    // Reuse an existing handoff thread if we already created one for this
    // conversation thread (recorded in the kv mapping, not by renaming the
    // handoff id — the registry id stays the package's generated id). Keeping
    // the mapping in kv avoids mutating the registry across an SSH send.
    const mapping = this.loadMapping();
    const existingId = mapping[id];
    if (existingId) {
      const existing = await this.engine.getRegistry().getThread(existingId);
      if (existing && existing.activeMachine === target.id) return this.statusForThread(id);
      if (existing) {
        await this.engine.send(existing.id, { machine: target.name }).catch((e) =>
          this.warn(id, `could not hand off to ${target.name}: ${String((e as Error).message)}`),
        );
        return this.statusForThread(id);
      }
    }

    // Create a new handoff thread owned by the target (remoteStart seeds the
    // registry with owner = target and starts the worker over the transport).
    const res = await this.engine.remoteStart(task, { machine: target.name }).catch((e) => {
      this.warn(id, `could not start remote thread: ${String((e as Error).message)}`);
      return null;
    });
    if (!res) return this.statusForThread(id);
    mapping[id] = res.thread.id;
    this.saveMapping(mapping);
    this.emit("event:handoffChanged", undefined);
    return this.statusForThread(id);
  }

  /** kv mapping conversation thread id → handoff thread id. */
  private loadMapping(): Record<string, string> {
    return this.kv.get<Record<string, string>>(MAPPING_KEY) ?? {};
  }
  private saveMapping(m: Record<string, string>): void {
    this.kv.set(MAPPING_KEY, m);
  }

  /** Resolve the target machine by name, else the first remote found. */
  private async resolveTarget(): Promise<Machine | null> {
    const self = await this.engine.getRegistry().self();
    const machines = await this.engine.listMachines();
    if (this.targetMachine) {
      const byName = machines.find((m) => m.name === this.targetMachine);
      if (byName) return byName;
    }
    return machines.find((m) => m.id !== self.id && (m.sshHost ?? null) !== null) ?? null;
  }

  /** Per-thread handoff status (owner / lease held here). */
  async statusForThread(id: ThreadId): Promise<ThreadHandoffStatus> {
    const mapping = this.loadMapping();
    const handoffId = mapping[id] ?? null;
    if (!handoffId) {
      return {
        threadId: id,
        owner: "none",
        handoffThreadId: null,
        remoteMachine: null,
        leaseHeldHere: false,
      };
    }
    const thread = await this.engine.getRegistry().getThread(handoffId);
    if (!thread) {
      return {
        threadId: id,
        owner: "none",
        handoffThreadId: null,
        remoteMachine: null,
        leaseHeldHere: false,
      };
    }
    const self = await this.engine.getRegistry().self();
    const owner = thread.activeMachine === self.id ? "local" : "remote";
    const ownerMachine = await this.engine
      .getRegistry()
      .getMachine(thread.activeMachine)
      .catch(() => null);
    const now = new Date();
    const liveLease =
      thread.leaseExpiresAt !== null &&
      new Date(thread.leaseExpiresAt).getTime() > now.getTime();
    return {
      threadId: id,
      owner,
      handoffThreadId: handoffId,
      remoteMachine: ownerMachine?.name ?? null,
      leaseHeldHere: liveLease && thread.leaseOwner === self.id,
    };
  }

  /** Surface a non-blocking warning to the renderer (and console). */
  private warn(threadId: ThreadId, message: string): void {
    console.warn(`[handoff] ${threadId}: ${message}`);
    this.emit("event:notice", { threadId, message, level: "warning" });
  }
}

/** Exposed for main.ts wiring (the typed IPC handlers live there). */
export function createHandoffService(
  db: AppDb,
  emit: Emit,
  /** Optional root override for tests; defaults to PEACH_ROOT / ~/.peach. */
  rootOverride?: string,
): HandoffAppService {
  const kv = new KvRepo(db);
  const root = rootOverride ?? process.env.PEACH_ROOT ?? join(homedir(), ".peach");
  return new HandoffAppService(kv, emit, root);
}

// Quiet the unused import for LocalTransport (kept for parity / future same-host path).
void LocalTransport;
