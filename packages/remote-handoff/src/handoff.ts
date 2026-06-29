import { pathExists } from "./paths.ts";
import {
  DEFAULT_ROOT,
  machineSlug,
  Registry,
} from "./registry.ts";
import {
  acquireLease,
  canMutate,
  isExpired,
  leaseHolder,
  releaseLease,
} from "./lease.ts";
import {
  ensureWorktree,
  fetchAll,
  fetchBranch,
  fastForward,
  headSha,
  wipCheckpoint,
  pushBranch,
  worktreeStatus,
  createRecoveryBranch,
  defaultBranch,
} from "./git.ts";
import { startWorker, stopWorker } from "./process.ts";
import { logPath, readLog, appendLog } from "./logs.ts";
import { genThreadId, threadBranch, worktreeDirName } from "./ids.ts";
import type {
  HandoffConfig,
  HandoffThread,
  Machine,
  RemoteThreadStatus,
  ThreadStatus,
} from "./types.ts";
import type { RemoteTransport } from "./transport.ts";
import { join } from "node:path";

/**
 * The movable-execution orchestrator. Wires the registry, lease, git workspace,
 * transport and worker process into the user-facing verbs. This is the ONLY
 * place that decides who may mutate a thread — the hard rule:
 *
 *   a machine must not mutate a thread unless it owns the lease.
 *
 * There is no master. "local" is simply the machine that currently owns the
 * thread; "remote" is any peer. Takeover and send are symmetric transfers of
 * ownership, each checkpointing dirty work into git before the move.
 */
export class HandoffService {
  private registry: Registry;
  private now: () => Date;
  private leaseMinutes: number;
  private defaultCommand: string | null;
  private transport: RemoteTransport;
  private configRoot: string;
  private configuredRepoPath: string | null;
  private configuredMachineName: string | null;

  constructor(opts: {
    root?: string;
    repoPath?: string | null;
    machineName?: string | null;
    transport: RemoteTransport;
    now?: () => Date;
    leaseMinutes?: number;
    command?: string | null;
  }) {
    this.configRoot = opts.root ?? DEFAULT_ROOT;
    this.registry = new Registry(this.configRoot);
    this.transport = opts.transport;
    this.now = opts.now ?? (() => new Date());
    this.leaseMinutes = opts.leaseMinutes ?? 60 * 24; // 24h default; movable, not short-lived
    this.defaultCommand = opts.command ?? process.env.PEACH_COMMAND ?? null;
    this.configuredRepoPath = opts.repoPath ?? process.env.PEACH_REPO ?? null;
    this.configuredMachineName = opts.machineName ?? process.env.PEACH_MACHINE ?? null;
  }

  /** Export the registry for CLI formatting / daemon helpers. */
  getRegistry(): Registry {
    return this.registry;
  }

  /** Current time (testable clock). */
  clock(): Date {
    return this.now();
  }

  /** This machine's record (self-registering on first use). */
  async self(): Promise<Machine> {
    if (this.configuredMachineName) {
      const existing = await this.registry.machineByName(this.configuredMachineName);
      if (existing) {
        if (this.configuredRepoPath) existing.repoPath = this.configuredRepoPath;
        await this.registry.setSelf(existing);
        return existing;
      }
    }
    const name = this.configuredMachineName ?? "local";
    const repoPath = await this.resolveRepoPath();
    const machine: Machine = {
      id: `m_${machineSlug(name)}`,
      name,
      role: "local",
      repoPath,
      workspaceRoot: join(this.configRoot, "workspaces"),
      onlineStatus: "online",
      lastSeenAt: this.now().toISOString(),
      sshHost: null,
    };
    return this.registry.setSelf(machine);
  }

  /** Resolve the shared repo path: configured > cwd if it's a repo > throw. */
  private async resolveRepoPath(): Promise<string> {
    if (this.configuredRepoPath) return this.configuredRepoPath;
    const cwd = process.cwd();
    if (await pathExists(join(cwd, ".git"))) return cwd;
    throw new Error("no repo path configured; run inside a git repo or set PEACH_REPO / --repo");
  }

  /** Register or update another machine. sshHost may be a Tailscale name. */
  async addMachine(input: {
    name: string;
    sshHost: string | null;
    repoPath?: string | null;
    role?: Machine["role"];
  }): Promise<Machine> {
    const name = input.name.trim();
    const existing = await this.registry.machineByName(name);
    const repoPath = input.repoPath ?? existing?.repoPath ?? (await this.resolveRepoPath());
    const machine: Machine = {
      id: existing?.id ?? `m_${machineSlug(name)}`,
      name,
      role: input.role ?? existing?.role ?? "remote",
      repoPath,
      workspaceRoot: join(this.configRoot, "workspaces"),
      onlineStatus: "unknown",
      lastSeenAt: existing?.lastSeenAt ?? null,
      sshHost: input.sshHost,
    };
    await this.registry.upsertMachine(machine);
    return machine;
  }

  async listMachines(): Promise<Machine[]> {
    return this.registry.loadMachines();
  }

  // ── verbs ───────────────────────────────────────────────────────────

  async listThreads(): Promise<HandoffThread[]> {
    return this.registry.loadThreads();
  }

  /**
   * Create a new thread intended to run on a (remote/home) machine. Generates
   * the id + branch, seeds the registry (owner = target), then asks the target
   * to create a worktree, import metadata and start the worker. If the target
   * is this machine, runs locally.
   */
  async remoteStart(
    task: string,
    opts: { machine?: string; base?: string; command?: string | null } = {},
  ): Promise<RemoteStartResult> {
    const self = await this.self();
    const target = await this.resolveTarget(opts.machine);
    const id = genThreadId();
    const branch = threadBranch(id, task);
    const repoPath = target.id === self.id ? (await this.resolveRepoPath()) : target.repoPath;
    const base = opts.base ?? (await defaultBranch(repoPath)) ?? "main";
    const command = this.resolveCommand(task, opts.command);
    const now = this.now();
    const thread: HandoffThread = {
      id,
      name: task,
      branch,
      status: "new",
      activeMachine: target.id,
      leaseOwner: target.id,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMinutes * 60_000).toISOString(),
      workspacePath: null,
      lastCommit: null,
      hasUncommittedChanges: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      baseBranch: base,
      command,
      pid: null,
      logPath: logPath(this.configRoot, id),
      recoveryBranch: null,
    };
    await this.registry.addThread(thread);

    if (target.id === self.id) {
      return this.localStart(thread);
    }

    // Remote target: seed the peer, then create worktree + start worker there.
    const warning = await this.remoteSeedStart(target, thread);
    return { thread, started: true, warning };
  }

  /** Take ownership of a thread to this machine (remote/home → local).
   *
   *  Safety model: a live lease on another machine does NOT silently block —
   *  a *cooperative* takeover asks the owner to pause, then checkpoints its
   *  tree and pushes before the lease moves. It is only refused (without
   *  --force) when the owner can't be paused (unreachable / refusing), because
   *  overwriting a running owner's uncommitted work is unsafe. --force skips
   *  the cooperative pause and captures a recovery branch instead. */
  async take(threadId: string, opts: { force?: boolean } = {}): Promise<TakeResult> {
    const self = await this.self();
    const thread = await this.registry.getThread(threadId);
    if (!thread) return fail(threadId, "no such thread");

    const holder = leaseHolder(thread, this.now());
    const force = opts.force ?? false;

    // Same machine already owns it → just ensure the local worktree is ready.
    if (holder === self.id) {
      const dir = await this.ensureLocalWorktree(thread);
      return { ok: true, threadId, workspacePath: dir, recoveryBranch: thread.recoveryBranch, warning: "already owned by this machine" };
    }

    const owner = await this.registry.getMachine(thread.activeMachine).catch(() => null);
    let recovery: string | null = null;
    let warning: string | null = null;

    if (force) {
      // Force: capture the owner's tip as a recovery branch (best effort),
      // then take whatever origin has. The owner may have unpushed work.
      if (owner && owner.id !== self.id) {
        recovery = await this.transport.recoveryBranch(owner, threadId).catch(() => null);
      }
      warning = recovery
        ? `forced takeover — recovery branch '${recovery}' on ${owner?.name ?? "remote"}; verify unpushed changes there`
        : "forced takeover — remote may have unpushed changes (recovery branch unavailable)";
    } else if (holder !== null) {
      // Cooperative: a live lease sits on another machine. We MUST pause the
      // owner before we can safely take; if we can't, refuse (not --force).
      if (!owner || owner.id === self.id) return fail(threadId, "lease owner is unset; cannot pause");
      const paused = await this.transport.pause(owner, threadId).catch(() => false);
      if (!paused)
        return fail(threadId, `thread is leased to '${holder}' on '${owner.name}' and could not be paused; use --force to override`);
      const cp = await this.transport.checkpoint(owner, threadId).catch(() => null);
      if (cp) thread.lastCommit = cp.sha;
      if (cp && !cp.pushed) warning = "remote pushed checkpoint with errors — pull may be stale";
    }
    // holder === null (lapsed lease) → nothing to pause; take freely.

    // Fetch + create/ff the local worktree on the thread branch.
    const repoPath = await this.resolveRepoPath();
    await fetchAll(repoPath).catch(() => undefined);
    await fetchBranch(repoPath, thread.branch).catch(() => undefined);
    const dir = await this.ensureLocalWorktree(thread);
    const ff = await fastForward(dir, thread.branch).catch((e: Error) => ({ ok: false as const, diverged: false, reason: e.message }));
    if (!ff.ok) {
      // Diverged or ff failed — do NOT overwrite. Leave the worktree at fetched tip.
      warning = append(warning, `worktree fast-forward refused: ${ff.reason}`);
    }
    const sha = await headSha(dir).catch(() => null);
    const st = await worktreeStatus(dir, thread.branch).catch(() => ({ dirty: false, branch: thread.branch, ahead: 0, behind: 0, diverged: false }));

    // Acquire the lease for this machine.
    const now = this.now();
    const updated = acquireLease(thread, self.id, this.leaseMinutes, now);
    const patched: HandoffThread = {
      ...updated,
      workspacePath: dir,
      pid: null,
      status: "paused",
      lastCommit: sha ?? thread.lastCommit,
      hasUncommittedChanges: st.dirty,
      recoveryBranch: recovery ?? thread.recoveryBranch,
    };
    await this.registry.putThread(patched);
    return { ok: true, threadId, workspacePath: dir, recoveryBranch: patched.recoveryBranch, warning };
  }

  /** Send ownership of a thread to a remote/home machine (local → remote). */
  async send(threadId: string, opts: { machine?: string } = {}): Promise<SendResult> {
    const self = await this.self();
    const thread = await this.registry.getThread(threadId);
    if (!thread) return failSend(threadId, "no such thread");
    if (!canMutate(thread, self.id, this.now()))
      return failSend(threadId, "this machine does not own the thread lease");

    const target = await this.resolveTarget(opts.machine);
    if (target.id === self.id) return failSend(threadId, "target is this machine; nothing to send");

    // 1. Stop local worker.
    stopWorker(thread.pid);
    // 2. WIP checkpoint + push so the work travels by git.
    const dir = await this.ownWorktreeDir(thread);
    let warning: string | null = null;
    if (dir) {
      const sha = await wipCheckpoint(dir, threadId, this.now()).catch(() => null);
      if (sha) thread.lastCommit = sha;
      else warning = "no WIP commit needed (clean tree)";
      const pushed = await pushBranch(dir, thread.branch).catch(() => false);
      if (!pushed) warning = append(warning, "push failed — remote fetch may be stale");
    } else {
      warning = "no local worktree to checkpoint; sending registry only";
    }

    // 3. Seed the receiver with updated metadata, create worktree, start.
    const seedWarn = await this.remoteSeedStart(target, thread, { start: true });

    // 4. Transfer the lease to the remote.
    const now = this.now();
    const remoteLeased = acquireLease(thread, target.id, this.leaseMinutes, now);
    const remoteStatus: ThreadStatus = "running";
    const patched: HandoffThread = {
      ...remoteLeased,
      status: remoteStatus,
      pid: null, // pid lives on the remote now
      workspacePath: target.repoPath ? null : thread.workspacePath, // remote owns its path
    };
    await this.registry.putThread(patched);
    return { ok: true, threadId, warning: append(warning, seedWarn) };
  }

  /**
   * Fetch known thread branches and prepare local worktrees for threads this
   * machine owns. NEVER mutates a workspace this machine does not own, unless
   * `readOnly` (metadata refresh only, no checkout writes).
   */
  async sync(opts: { readOnly?: boolean } = {}): Promise<SyncResult> {
    const self = await this.self();
    const repoPath = await this.resolveRepoPath();
    await fetchAll(repoPath).catch(() => undefined);
    const threads = await this.registry.loadThreads();
    let updated = 0;
    let skipped = 0;
    const warnings: string[] = [];
    for (const t of threads) {
      const owned = leaseHolder(t, this.now()) === self.id;
      if (!owned && opts.readOnly !== true) {
        skipped++;
        continue;
      }
      // Refresh remote-tracking presence so status reflects origin.
      await fetchBranch(repoPath, t.branch).catch(() => undefined);
      if (opts.readOnly === true && !owned) {
        skipped++;
        continue;
      }
      const dir = join(self.workspaceRoot, worktreeDirName(t.id));
      try {
        await ensureWorktree(repoPath, dir, t.branch, t.baseBranch).catch(() => undefined);
        if (owned) {
          await fastForward(dir, t.branch).catch((e: Error) => {
            warnings.push(`${t.id}: ff refused (${e.message})`);
          });
          const st = await worktreeStatus(dir, t.branch).catch(() => null);
          if (st) {
            await this.registry.updateThread(t.id, {
              workspacePath: dir,
              hasUncommittedChanges: st.dirty,
              lastCommit: await headSha(dir).catch(() => null),
            }, this.now());
            updated++;
          }
        } else {
          updated++;
        }
      } catch (e) {
        warnings.push(`${t.id}: ${String((e as Error).message)}`);
      }
    }
    return { fetched: threads.length, updated, skipped, warnings };
  }

  /** Thread status, enriched with git + owner. Reads the owner if it's remote. */
  async status(threadId: string): Promise<StatusView> {
    const self = await this.self();
    const thread = await this.registry.getThread(threadId);
    if (!thread) return { thread: null, owner: null, git: null, self: false, leaseHeld: false };
    const owner = await this.registry.getMachine(thread.activeMachine).catch(() => null);
    const isSelf = thread.activeMachine === self.id;
    const leaseHeld = leaseHolder(thread, this.now()) === self.id;

    let git: StatusView["git"] = null;
    if (isSelf) {
      const dir = await this.ownWorktreeDir(thread);
      if (dir) {
        const st = await worktreeStatus(dir, thread.branch).catch(() => null);
        git = st
          ? { dirty: st.dirty, ahead: st.ahead, behind: st.behind, diverged: st.diverged, lastCommit: await headSha(dir).catch(() => null) }
          : null;
      }
    } else if (owner && owner.id !== self.id) {
      const remote = await this.transport.threadStatus(owner, threadId).catch(() => null);
      if (remote) {
        git = { dirty: remote.hasUncommittedChanges, ahead: 0, behind: 0, diverged: false, lastCommit: remote.lastCommit };
      }
    }
    return { thread, owner, git, self: isSelf, leaseHeld };
  }

  /** Read the thread log — local if owned, else polled from the owner. */
  async logs(threadId: string, lines?: number): Promise<string> {
    const self = await this.self();
    const thread = await this.registry.getThread(threadId);
    if (!thread) return `# no such thread: ${threadId}`;
    const owner = await this.registry.getMachine(thread.activeMachine).catch(() => null);
    if (thread.activeMachine === self.id || !owner || owner.id === self.id) {
      return readLog(thread.logPath ?? logPath(this.configRoot, threadId), lines);
    }
    return this.transport.logs(owner, threadId, lines);
  }

  // ── daemon RPC (invoked by `peach daemon <sub>` on a peer) ──────────
  // These run on the machine that OWNS the thread at call time. Each returns
  // JSON the transport relays; they perform the local mutation the owner is
  // permitted to do (because it holds the lease).

  async daemonPing(): Promise<"pong"> {
    return "pong";
  }

  async daemonStatus(threadId: string): Promise<RemoteThreadStatus> {
    const thread = await this.registry.getThread(threadId);
    if (!thread) throw new Error(`unknown thread: ${threadId}`);
    const dir = await this.ownWorktreeDir(thread);
    const st = dir ? await worktreeStatus(dir, thread.branch).catch(() => null) : null;
    return {
      threadId,
      status: thread.status,
      pid: thread.pid,
      logPath: thread.logPath,
      workspacePath: thread.workspacePath,
      lastCommit: thread.lastCommit,
      hasUncommittedChanges: st?.dirty ?? thread.hasUncommittedChanges,
    };
  }

  async daemonPause(threadId: string): Promise<boolean> {
    const thread = await this.registry.getThread(threadId);
    if (!thread) return false;
    stopWorker(thread.pid);
    await this.registry.updateThread(threadId, { pid: null, status: "paused" }, this.now());
    await appendLog(thread.logPath ?? logPath(this.configRoot, threadId), "\n# paused by remote request\n").catch(() => undefined);
    return true;
  }

  async daemonStart(threadId: string): Promise<boolean> {
    const thread = await this.registry.getThread(threadId);
    if (!thread || !thread.command) return false;
    const dir = await this.ownWorktreeDir(thread);
    if (!dir) return false;
    const started = await startWorker(
      thread.command,
      thread.logPath ?? logPath(this.configRoot, threadId),
      dir,
    ).catch(() => null);
    if (!started) return false;
    // Keep origin in step with the resumed branch.
    await pushBranch(dir, thread.branch).catch(() => undefined);
    await this.registry.updateThread(
      threadId,
      { pid: started.pid, status: "running", workspacePath: dir },
      this.now(),
    );
    return true;
  }

  async daemonCheckpoint(threadId: string): Promise<{ sha: string | null; pushed: boolean }> {
    const thread = await this.registry.getThread(threadId);
    if (!thread) throw new Error(`unknown thread: ${threadId}`);
    const dir = await this.ownWorktreeDir(thread);
    if (!dir) return { sha: null, pushed: false };
    const sha = await wipCheckpoint(dir, threadId, this.now());
    let pushed = false;
    if (sha) pushed = await pushBranch(dir, thread.branch);
    if (sha) await this.registry.updateThread(threadId, { lastCommit: sha, hasUncommittedChanges: false }, this.now());
    return { sha, pushed };
  }

  async daemonWorktree(threadId: string): Promise<{ workspacePath: string | null }> {
    const self = await this.self();
    const thread = await this.registry.getThread(threadId);
    if (!thread) return { workspacePath: null };
    const repoPath = await this.resolveRepoPath();
    await fetchAll(repoPath).catch(() => undefined);
    await fetchBranch(repoPath, thread.branch).catch(() => undefined);
    const dir = join(self.workspaceRoot, worktreeDirName(threadId));
    await ensureWorktree(repoPath, dir, thread.branch, thread.baseBranch).catch((e: Error) => {
      throw new Error(`ensureWorktree failed: ${e.message}`);
    });
    await this.registry.updateThread(threadId, { workspacePath: dir }, this.now());
    return { workspacePath: dir };
  }

  async daemonRecovery(threadId: string): Promise<string | null> {
    const thread = await this.registry.getThread(threadId);
    if (!thread) return null;
    try {
      const repoPath = await this.resolveRepoPath();
      const self = await this.self();
      return await createRecoveryBranch(repoPath, thread.branch, thread.id, self.name, this.now());
    } catch {
      return null;
    }
  }

  async daemonImport(threadId: string, payload: HandoffThread): Promise<boolean> {
    if (threadId !== payload.id) return false;
    await this.registry.putThread(payload);
    return true;
  }

  /** Peer-side log reader: tail the local thread log file. */
  async daemonLogs(threadId: string, lines?: number): Promise<string> {
    const thread = await this.registry.getThread(threadId);
    const p = thread?.logPath ?? logPath(this.configRoot, threadId);
    return readLog(p, lines);
  }

  // ── internals ──────────────────────────────────────────────────────

  /** Resolve a machine by name; null/undefined → first remote, else self.
   *  `peach remote start` with no --machine targets the configured remote/home
   *  machine, but degrades to starting locally when no remote is registered. */
  private async resolveTarget(name?: string): Promise<Machine> {
    const self = await this.self();
    if (name && (name === self.name || name === "local")) return self;
    if (name) {
      const byName = await this.registry.machineByName(name);
      if (byName) return byName;
    }
    const machines = await this.registry.loadMachines();
    // First remote-shaped machine (has an sshHost, not this one).
    const remote = machines.find((m) => m.id !== self.id && m.sshHost);
    if (remote) return remote;
    // First registered machine that isn't self (even without sshHost).
    const other = machines.find((m) => m.id !== self.id);
    if (other) return other;
    // No remote configured → run on this machine, noting it.
    return self;
  }

  /** Seed a remote target with the thread record, create its worktree, start. */
  private async remoteSeedStart(
    target: Machine,
    thread: HandoffThread,
    opts: { start?: boolean } = {},
  ): Promise<string | null> {
    const imported = await this.transport.importThread(target, thread).catch(() => false);
    if (!imported) return `could not import thread to ${target.name} (is peach on PATH?)`;
    await this.transport.ensureWorktree(target, thread.id).catch((e: Error) => `worktree setup failed: ${e.message}`);
    if (opts.start !== false) {
      const started = await this.transport.start(target, thread.id).catch(() => false);
      if (!started) return `worker start requested on ${target.name} (verify logs)`;
      // Refresh pid/status from the owner so the controller's record is live.
      const status = await this.transport.threadStatus(target, thread.id).catch(() => null);
      if (status) {
        await this.registry.updateThread(thread.id, {
          status: status.status,
          pid: status.pid,
          workspacePath: status.workspacePath,
          lastCommit: status.lastCommit,
          hasUncommittedChanges: status.hasUncommittedChanges,
        }, this.now());
      }
    }
    return null;
  }

  /** Start a thread locally (target == self). */
  private async localStart(thread: HandoffThread): Promise<RemoteStartResult> {
    const self = await this.self();
    const repoPath = await this.resolveRepoPath();
    await fetchAll(repoPath).catch(() => undefined);
    const dir = join(self.workspaceRoot, worktreeDirName(thread.id));
    await ensureWorktree(repoPath, dir, thread.branch, thread.baseBranch);
    await pushBranch(dir, thread.branch).catch(() => undefined);
    let warning: string | null = null;
    if (thread.command) {
      const started = await startWorker(
        thread.command,
        thread.logPath ?? logPath(this.configRoot, thread.id),
        dir,
      ).catch(() => null);
      if (started) {
        await this.registry.updateThread(thread.id, {
          pid: started.pid,
          status: "running",
          workspacePath: dir,
        }, this.now());
      } else {
        warning = "worker failed to start; thread created in paused state";
        await this.registry.updateThread(thread.id, { status: "paused", workspacePath: dir }, this.now());
      }
    }
    const fresh = await this.registry.getThread(thread.id);
    return { thread: fresh ?? thread, started: true, warning };
  }

  /** Ensure the local worktree for a thread this machine is taking over. */
  private async ensureLocalWorktree(thread: HandoffThread): Promise<string> {
    const self = await this.self();
    const repoPath = await this.resolveRepoPath();
    const dir = join(self.workspaceRoot, worktreeDirName(thread.id));
    await ensureWorktree(repoPath, dir, thread.branch, thread.baseBranch);
    return dir;
  }

  /** The local worktree dir for a thread this machine owns, if it exists. */
  private async ownWorktreeDir(thread: HandoffThread): Promise<string | null> {
    const self = await this.self();
    const dir = thread.workspacePath ?? join(self.workspaceRoot, worktreeDirName(thread.id));
    return (await pathExists(join(dir, ".git"))) ? dir : null;
  }

  /** Resolve the worker command: explicit > configured > a logged stub. */
  private resolveCommand(task: string, override?: string | null): string | null {
    if (override) return override;
    if (this.defaultCommand) return this.defaultCommand;
    // MVP stub: logs the task and stays alive so status reads "running" until
    // a takeover stops it. Replace via PEACH_COMMAND for a real agent runtime.
    return `sh -c "echo '[peach] worker: ${task.replace(/"/g, "\\\"")}'; sleep 3600"`;
  }
}

// ── result + helper types ─────────────────────────────────────────────
export interface TakeResult {
  ok: boolean;
  threadId: string;
  workspacePath: string | null;
  recoveryBranch: string | null;
  warning: string | null;
  error?: string;
}
export interface SendResult {
  ok: boolean;
  threadId: string;
  warning: string | null;
  error?: string;
}
export interface SyncResult {
  fetched: number;
  updated: number;
  skipped: number;
  warnings: string[];
}
export interface StatusView {
  thread: HandoffThread | null;
  owner: Machine | null;
  git: { dirty: boolean; ahead: number; behind: number; diverged: boolean; lastCommit: string | null } | null;
  self: boolean;
  leaseHeld: boolean;
}
export interface RemoteStartResult {
  thread: HandoffThread;
  started: boolean;
  warning: string | null;
}

function fail(threadId: string, error: string): TakeResult {
  return { ok: false, threadId, workspacePath: null, recoveryBranch: null, warning: null, error };
}
function failSend(threadId: string, error: string): SendResult {
  return { ok: false, threadId, warning: null, error };
}
function append(existing: string | null, more: string | null): string {
  if (!more) return existing ?? "";
  return existing ? `${existing}; ${more}` : more;
}
