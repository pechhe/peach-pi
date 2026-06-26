/** Public surface of the movable-execution package.
 *
 *  The desktop app imports `HandoffService`, `SshTransport`, the types and the
 *  naming helpers from here. Internal modules (git/process/logs) are not
 *  re-exported — the desktop reaches the engine only through `HandoffService`.
 *
 *  The shared git CLI boundary (`git-cli.ts`) is re-exported here because it
 *  is the one git seam shared by both this package and the desktop app.
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
// Shared git CLI boundary — the single seam for shelling out to `git`
// (git / gitOk / gitEnv / gitOrFail / toHttpsRepoUrl). See ./git-cli.ts.
export {
  git,
  gitEnv,
  gitOk,
  gitOrFail,
  toHttpsRepoUrl,
} from "./git-cli.ts";

export {
  genThreadId,
  recoveryBranchName,
  slugify,
  threadBranch,
  wipCommitMessage,
  worktreeDirName,
} from "./ids.ts";

// `originUrl` (read a repo's origin remote, normalized to https) joins the
// shared git CLI boundary — like `toHttpsRepoUrl`, the served-session
// checkpoint helpers call this rather than reimplementing `git remote`.
export { originUrl } from "./git-cli.ts";
