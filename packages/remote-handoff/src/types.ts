/** Movable-execution data model.
 *
 * A *machine* is one laptop participating in Peach. A *thread* is a unit of
 * work that is owned by exactly one machine at a time — only the owner may
 * mutate that thread's workspace. These types are deliberately separate from
 * the desktop app's `Thread` entity (a pi conversation session): a
 * `HandoffThread` is a movable work unit whose branch, checkout, logs and
 * status follow it between machines.
 *
 * The boundary mirrors ADR-0009's split: code crosses as git (a dedicated
 * `peach/<id>` branch per thread), status/logs cross over the transport.
 */

export type MachineRole = "local" | "remote" | "both";
export type MachineStatus = "unknown" | "online" | "offline";

/** One laptop/computer participating in Peach. Each runs the `peach` CLI. */
export interface Machine {
  id: string;
  name: string;
  role: MachineRole;
  /** Absolute path to the shared git repo on THIS machine. */
  repoPath: string;
  /** Root dir for per-thread worktrees on THIS machine (~/.peach/workspaces). */
  workspaceRoot: string;
  onlineStatus: MachineStatus;
  lastSeenAt: string | null;
  /** Tailscale host or IP used by the SSH transport (no scheme/port). */
  sshHost: string | null;
}

export type ThreadStatus =
  | "new"
  | "running"
  | "paused"
  | "waiting"
  | "complete"
  | "failed";

/** A movable unit of work. At any moment exactly one machine owns it. */
export interface HandoffThread {
  id: string;
  name: string;
  branch: string;
  status: ThreadStatus;
  /** Machine id currently owning the thread (runs the workspace). */
  activeMachine: string;
  /** Machine id holding the lease (== activeMachine while leased). */
  leaseOwner: string;
  leaseExpiresAt: string | null;
  /** Absolute path to the worktree checkout on the *owning* machine. */
  workspacePath: string | null;
  lastCommit: string | null;
  hasUncommittedChanges: boolean;
  createdAt: string;
  updatedAt: string;
  /** Base branch the thread branched from (e.g. main). */
  baseBranch: string;
  /** Worker command launched on start/resume; null until set. */
  command: string | null;
  /** OS pid of the running worker on the owning machine, if any. */
  pid: number | null;
  /** Absolute log path on the owning machine, if known. */
  logPath: string | null;
  /** Recovery branch created by a forced takeover, if any. */
  recoveryBranch: string | null;
}

/** Minimal status payload shipped across the transport from a peer machine. */
export interface RemoteThreadStatus {
  threadId: string;
  status: ThreadStatus;
  pid: number | null;
  logPath: string | null;
  workspacePath: string | null;
  lastCommit: string | null;
  hasUncommittedChanges: boolean;
}

export interface HandoffConfig {
  /** Root dir for all peach state (~/.peach). */
  root: string;
  /** Shared repo path on this machine; null to resolve from cwd. */
  repoPath: string | null;
  /** This machine's name/id. */
  machineName: string;
  /** Default lease duration in minutes. */
  leaseMinutes: number;
}
