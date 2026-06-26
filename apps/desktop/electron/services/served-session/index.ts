/**
 * Served-session seam (ADR-0009 + ADR-0010, seam structure in ADR-0012).
 *
 * A master serves its live `AgentSession` over a tailnet HTTP relay; clients
 * attach read-only and steer back through a thin forwarder. This barrel exposes
 * the public surface of the former `remote-*` cluster's "concept A" half:
 *
 *  - `relay-host.ts` — the master relay (`RemoteHostService` + `RelayActions`).
 *  - `relay-client.ts` — the laptop client (`RemoteClientService`).
 *  - `checkpoint.ts` — ADR-0009 throwaway-`GIT_INDEX_FILE` checkpoint helpers.
 *  - `tailnet-bind.ts` — tailnet IP resolution + token validation (security
 *    boundary; bind correctness is a tested invariant).
 *  - `tailscale-serve.ts` — the single v1 `TransportAdapter` (Tailscale).
 *  - `routes.ts` — shared verb/route table (`ServedSessionRoutes`).
 *  - `http-shared.ts` — `fetchJsonWithTimeout` + `readJsonBody`.
 *
 * Imports of single modules go through the barrel; importers never reach into
 * the individual files, so the cluster stays a single named surface.
 */
export { RemoteHostService, authorizeRequest } from "./relay-host.ts";
export type { RelayDeps, RelayActions } from "./relay-host.ts";
export { RemoteClientService } from "./relay-client.ts";
export {
  checkpointBranch,
  snapshotToBranch,
  pushCheckpoint,
  checkpointTip,
  recordCheckpoint,
} from "./checkpoint.ts";
export { originUrl } from "./checkpoint.ts";
export {
  resolveTailnetIp,
  resolveBindAddress,
  isCgnat,
  isRfc1918,
  isValidToken,
} from "./tailnet-bind.ts";
export type { IfaceAddress } from "./tailnet-bind.ts";
export {
  TailscaleTransportAdapter,
  getConnectInfo,
  enableServe,
  listTailnetPeers,
  listTailnetPeersDefault,
} from "./tailscale-serve.ts";
export type { TailscaleAdapterConfig } from "./tailscale-serve.ts";
export {
  SERVED_SESSION_ROUTES,
  messagePath,
  steerPath,
  abortPath,
  archivePath,
  controlPath,
  deleteQueuedPath,
  gitCommitPushPath,
  gitPrPath,
  gitMergePath,
  createThreadPath,
  createChatPath,
} from "./routes.ts";
export { fetchJsonWithTimeout, readJsonBody, DEFAULT_FETCH_TIMEOUT_MS } from "./http-shared.ts";
