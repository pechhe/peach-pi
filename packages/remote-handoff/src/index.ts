/** Public surface of the movable-execution package.
 *
 *  The desktop app imports `HandoffService`, `SshTransport`, the types and the
 *  naming helpers from here. Internal modules (git/process/logs) are not
 *  re-exported — the desktop reaches the engine only through `HandoffService`.
 */
export { HandoffService } from "./handoff.ts";
export type {
  HandoffConfig,
  HandoffThread,
  Machine,
  MachineRole,
  MachineStatus,
  RemoteThreadStatus,
  ThreadStatus,
} from "./types.ts";
export { SshTransport, LocalTransport } from "./transport.ts";
export type { RemoteTransport } from "./transport.ts";
export {
  genThreadId,
  recoveryBranchName,
  slugify,
  threadBranch,
  wipCommitMessage,
  worktreeDirName,
} from "./ids.ts";
