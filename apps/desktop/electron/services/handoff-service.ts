import { homedir } from "node:os";
import { join } from "node:path";
import type { RemoteFirstMode, ThreadHandoffStatus, ThreadId } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { KvRepo } from "../persistence/repositories.ts";
import {
  HandoffService,
  LocalTransport,
  SshTransport,
  type HandoffThread,
  type Machine,
} from "@peach-pi/remote-handoff";
import type { Emit } from "../ipc/registry.ts";

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
const PEACH_ROOT = join(homedir(), ".peach");

/** Persisted shape: just the boolean + chosen target machine name. */
interface PersistedMode {
  enabled: boolean;
  targetMachine: string | null;
}

export class HandoffAppService {
  private engine: HandoffService;
  /** The remote machine name threads are sent to (null = first remote found). */
  private targetMachine: string | null = null;

  constructor(
    private kv: KvRepo,
    private emit: Emit,
  ) {
    // SSH transport for real cross-machine handoff; the engine falls back to
    // LocalTransport behaviour when the peer turns out to be this machine.
    this.engine = new HandoffService({
      root: PEACH_ROOT,
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

    // Look for an existing handoff thread keyed by the conversation thread.
    const existing = (await this.engine.listThreads()).find((t) => t.id === this.handoffId(id));
    if (existing && existing.activeMachine === target.id) {
      return this.statusForThread(id);
    }
    if (existing) {
      // Already a handoff thread but owned elsewhere / here → send it to target.
      await this.engine.send(existing.id, { machine: target.name }).catch((e) =>
        this.warn(id, `could not hand off to ${target.name}: ${String((e as Error).message)}`),
      );
      return this.statusForThread(id);
    }

    // Create a new handoff thread "remote started" on this machine, then send
    // it to the target — mirroring the `peach remote start` + `send` flow.
    const res = await this.engine.remoteStart(task, { machine: "local" }).catch((e) => {
      this.warn(id, `could not start remote thread: ${String((e as Error).message)}`);
      return null;
    });
    if (!res) return this.statusForThread(id);
    // Re-key the handoff thread's id to the conversation thread id so we can
    // find it again next message. (The branch embeds the id; renaming the id
    // field keeps the branch stable as a checkoutable ref.)
    await this.engine.getRegistry().removeThread(res.thread.id).catch(() => undefined);
    const renamed: HandoffThread = { ...res.thread, id: this.handoffId(id) };
    await this.engine.getRegistry().addThread(renamed);
    await this.engine.send(renamed.id, { machine: target.name }).catch((e) =>
      this.warn(id, `could not hand off to ${target.name}: ${String((e as Error).message)}`),
    );
    this.emit("event:handoffChanged", undefined);
    return this.statusForThread(id);
  }

  /** The handoff thread id derived from a conversation thread id. */
  private handoffId(conversationThreadId: ThreadId): string {
    return `thread_cv_${conversationThreadId.replace(/[^a-z0-9_-]/gi, "").slice(0, 24)}`;
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
    const handoffId = this.handoffId(id);
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
    const ownerMachine = await this.engine.getRegistry().getMachine(thread.activeMachine).catch(() => null);
    const now = new Date();
    const liveLease =
      thread.leaseExpiresAt !== null && new Date(thread.leaseExpiresAt).getTime() > now.getTime();
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
export function createHandoffService(db: AppDb, emit: Emit): HandoffAppService {
  const kv = new KvRepo(db);
  return new HandoffAppService(kv, emit);
}

// Quiet the unused import for LocalTransport (kept for parity / future same-host path).
void LocalTransport;
