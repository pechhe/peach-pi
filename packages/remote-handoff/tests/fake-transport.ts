import type { HandoffThread, Machine, RemoteThreadStatus } from "../src/types.ts";

/**
 * An in-memory transport for tests. Two `FakeTransport` instances wired
 * together simulate two machines talking to each other: each machine's
 * service calls its *outbound* transport, which is routed to the *peer's*
 * inbound daemon handlers. This models the symmetric, no-master relationship
 * exactly — both ends are peers that happen to own different threads.
 */
export interface DaemonHandlers {
  ping: () => Promise<boolean>;
  status: (threadId: string) => Promise<RemoteThreadStatus>;
  pause: (threadId: string) => Promise<boolean>;
  start: (threadId: string) => Promise<boolean>;
  checkpoint: (threadId: string) => Promise<{ sha: string | null; pushed: boolean }>;
  ensureWorktree: (threadId: string) => Promise<{ workspacePath: string | null }>;
  logs: (threadId: string, lines?: number) => Promise<string>;
  recoveryBranch: (threadId: string) => Promise<string | null>;
  importThread: (thread: HandoffThread) => Promise<boolean>;
}

export class FakeTransport {
  /** Routes a call to the *peer* machine's daemon handlers. */
  peerHandlers: DaemonHandlers | null = null;
  pauseOk = true;
  startOk = true;
  checkpointResult: { sha: string | null; pushed: boolean } | null = null;
  lastCall: string | null = null;
  calls: string[] = [];

  async ping(machine: Machine): Promise<boolean> {
    this.record(machine, "ping");
    return this.peerHandlers ? this.peerHandlers.ping() : true;
  }
  async threadStatus(machine: Machine, threadId: string): Promise<RemoteThreadStatus> {
    this.record(machine, "status");
    return this.peerHandlers!.status(threadId);
  }
  async pause(machine: Machine, threadId: string): Promise<boolean> {
    this.record(machine, "pause");
    if (!this.peerHandlers) return this.pauseOk;
    if (!this.pauseOk) return false;
    return this.peerHandlers.pause(threadId);
  }
  async start(machine: Machine, threadId: string): Promise<boolean> {
    this.record(machine, "start");
    if (!this.peerHandlers) return this.startOk;
    if (!this.startOk) return false;
    return this.peerHandlers.start(threadId);
  }
  async checkpoint(machine: Machine, threadId: string): Promise<{ sha: string | null; pushed: boolean }> {
    this.record(machine, "checkpoint");
    if (this.checkpointResult) return this.checkpointResult;
    return this.peerHandlers!.checkpoint(threadId);
  }
  async ensureWorktree(machine: Machine, threadId: string): Promise<{ workspacePath: string | null }> {
    this.record(machine, "worktree");
    return this.peerHandlers!.ensureWorktree(threadId);
  }
  async logs(machine: Machine, threadId: string, lines?: number): Promise<string> {
    this.record(machine, "logs");
    return this.peerHandlers!.logs(threadId, lines);
  }
  async recoveryBranch(machine: Machine, threadId: string): Promise<string | null> {
    this.record(machine, "recovery");
    return this.peerHandlers!.recoveryBranch(threadId);
  }
  async importThread(machine: Machine, thread: HandoffThread): Promise<boolean> {
    this.record(machine, "import");
    return this.peerHandlers!.importThread(thread);
  }
  private record(machine: Machine, verb: string): void {
    this.lastCall = `${verb}@${machine.name}`;
    this.calls.push(this.lastCall);
  }
}
