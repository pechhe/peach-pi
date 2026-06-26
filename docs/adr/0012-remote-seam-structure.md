# ADR-0012: Remote seam structure (served-session vs movable-execution)

Status: Proposed (2026-06-26) — awaiting review on issue #31.
Supersedes the **naming** (not the decisions) of ADR-0009 / ADR-0010 / ADR-0011.

## Decision

Coalesce the "remote" cluster in `apps/desktop/electron/services/` around **two
named seams**, not one merged umbrella. The seams are named after the
user-facing capability, not the transport:

1. **`served-session/`** — ADR-0009 + ADR-0010. The master serves a live
   `AgentSession` over a tailnet HTTP relay; clients attach read-only and steer
   back through a thin forwarder.
2. **`movable-execution/`** — ADR-0011. The single active owner of a thread at a
   moment; takeover transfers ownership via a lease, and an SSH handoff arm
   relocates the branch to another machine.

```
apps/desktop/electron/services/
  served-session/
    index.ts               # barrel: public surface
    relay-host.ts           # ← remote-host.ts (lease extracted out)
    relay-client.ts         # ← remote-client.ts
    checkpoint.ts           # ← remote-checkpoint.ts (originUrl → remote-handoff)
    tailnet-bind.ts         # ← remote-tailnet.ts
    tailscale-serve.ts      # ← remote-serve.ts (TransportAdapter impl)
    routes.ts               # NEW: shared verb contract (ServedSessionRoutes)
    http-shared.ts          # NEW: fetchJsonWithTimeout + readJsonBody
  movable-execution/
    index.ts               # barrel
    steering-lease.ts       # ← remote-steering-lease.ts (renamed off remote-)
    handoff-service.ts      # ← handoff-service.ts (no rename — already honest)
```

## Why two seams, not one "remote" umbrella

- The transports are genuinely different: tailnet HTTP relay (A) vs SSH branch
  handoff (B). One umbrella would re-smear the exact prefix lie this cluster
  currently suffers (every file is `remote-*`, every reader needs comments).
- Two siblings make the ADR boundary visible in the file tree: ADR-0009/0010 on
  one side, ADR-0011 on the other.
- `handoff-service.ts` already proves the pattern — it is the one honestly
  named file and the only one that reads cleanly in isolation. Promoting that
  honesty to the whole cluster is the smallest consistent change.

## What changes vs what stays

**Stays (decisions not reopened):**
- ADR-0009 "host from peach-pi itself", "code crosses as git, conversation as
  one-way event stream", tailnet + bearer token security model.
- ADR-0010 steer-back write path, `RelayActions` is a thin forwarder.
- ADR-0011 lease TTL = 60 s, force-takeover semantics, two halves not unified.

**Changes (naming + seam structure only):**
- `remote-steering-lease.ts` → `movable-execution/steering-lease.ts` (renamed
  off the lying `remote-` prefix; concept B, lives behind seam 2).
- The relay's private `leases` field is extracted: the relay imports
  `SteeringLeaseStore` from `movable-execution/`, so concept-B code physically
  lives in concept-B's directory even though the relay still uses it.
- `handoff-service.ts` moves into `movable-execution/` with **no rename** — the
  directory does the disambiguating, and `handoff` already names the mechanism.
- Transport coupling localized behind a `TransportAdapter` interface (§below).
- Verb sets derived from one shared `ServedSessionRoutes` type (§below).

## TransportAdapter interface

`remote-serve.ts` is the only Tailscale CLI caller in the cluster today;
`remote-host.ts` is already test-without-tailscale via injected `setHostHooks`.
We localize the Tailscale coupling behind an interface so the relay never shells
out and a future mesh adapter can substitute without touching the relay:

```ts
export interface TransportAdapter {
  resolveBindAddress(): Promise<IfaceAddress[]>;
  enableServe(relayPort: number): Promise<void>;
  serveActiveFor(relayPort: number): Promise<boolean>;
  listPeers(): Promise<RemoteTailnetPeer[]>;
  getConnectInfo(opts: { relayPort: number; token: string }): Promise<RemoteConnectInfo>;
}
```

v1 has exactly one implementation (Tailscale). The interface exists to
localize coupling, **not** to invite a second implementation — a second tailnet
adapter (ZeroTier/WireGuard) is not realistic for v1 because ADR-0009's security
model is explicit that the mesh + bearer token are the entire boundary;
swapping the mesh changes the security argument, not just transport. The
hard-coded `WATCH_APP_URL` and `TS_BINS` candidate paths become adapter config.

## Shared verb contract

Today the server's `RelayActions` (`remote-host.ts:108`, 10 verbs) and the
client's hand-coded methods (carrying `(hostId, threadId, …)`) are **duplicated,
not shared** — route literals appear in both files, and the client has
`takeControl`/`releaseControl` verbs with no `RelayActions` entry. We derive
both from one type in `packages/shared-types`:

```ts
export interface ServedSessionRoutes {
  message:       { path: "/sessions/:threadId/message";        body: { text: string } };
  steer:         { path: "/sessions/:threadId/steer";           body: { text: string } };
  abort:         { path: "/sessions/:threadId/abort";          body: Record<string, never> };
  archive:       { path: "/sessions/:threadId/archive";        body: Record<string, never> };
  control:       { path: "/sessions/:threadId/control";        body: { force?: boolean; release?: boolean } };
  deleteQueued:  { path: "/sessions/:threadId/queue/delete";   body: { kind: "steer" | "followUp"; index: number } };
  gitCommitPush: { path: "/sessions/:threadId/git/commit-push";body: { message?: string } };
  gitPr:         { path: "/sessions/:threadId/git/pr";         body: Record<string, never> };
  gitMerge:      { path: "/sessions/:threadId/git/merge";     body: Record<string, never> };
  createThread:  { path: "/threads"; body: { projectId: ProjectId } };
  createChat:    { path: "/chats";   body: Record<string, never> };
}
```

`RelayActions` becomes the server-side function shape derived from this table;
the client's `postJson` paths come from the same constants. `control` becomes a
first-class entry, closing the gap where the client had verbs the server
interface didn't declare. No new behavior — the verbs and routes already exist
identically on both sides.

## Consolidated HTTP helpers

Four+ fetch/JSON-with-timeout variants exist today
(`usage-adapters.ts:fetchJson`, an inline copy in `usage-mimo-adapter.ts`, bare
`fetch` in `usage-anthropic-adapter.ts`, raw-`http.request` `getJson`/`postJson`
in `remote-client.ts`, plus `readJsonBody` in `remote-host.ts` and a capless
`readJson` in `connector-resolver.ts`). They consolidate into two helpers in
`served-session/http-shared.ts`:

- `fetchJsonWithTimeout(url, { headers, timeoutMs, body? })` — fetch family.
- `readJsonBody(req, { maxBytes })` — `node:http` `IncomingMessage` bodies.

The sync file-based `readJson` in `pi-health.ts` stays (different concept, name
clash only). `remote-client.ts` switching from raw `http.request` to `fetch`
(and gaining a mandatory `timeoutMs` — today it has none) is an implementation
concern for the follow-up issue, not part of this ADR's decision.

## `remote-checkpoint.ts` mostly dissolves

`originUrl()` (`remote-checkpoint.ts:49`) is already a thin wrapper around
`toHttpsRepoUrl` from `@peach-pi/remote-handoff/git-cli.ts` — the normalizer is
consolidated there; `remote-checkpoint.ts` already imports and calls it. The
surviving `git remote get-url origin` step moves into `@peach-pi/remote-handoff`
(it's a git-CLI concern). The rest (`snapshotToBranch`, `pushCheckpoint`,
`checkpointTip`, `recordCheckpoint`) stays as `served-session/checkpoint.ts` —
it does **not** route through `git-service.snapshot()`, which would touch
HEAD/index. ADR-0009's throwaway-`GIT_INDEX_FILE` recipe is a deliberate
non-disturbance invariant; consolidating it would reintroduce a hazard
ADR-0009 explicitly removed.

## Consequences

- The `remote-*` prefix is retired for new files; the two seams are
  self-describing. (`remote-host.ts` etc. keep their names inside the new dirs
  only where they are still accurate — see migration table in the design doc;
  `remote-serve.ts` → `tailscale-serve.ts`, `remote-tailnet.ts` →
  `tailnet-bind.ts`, `remote-steering-lease.ts` → `steering-lease.ts`.)
- Import sites update to the barrels (`served-session` / `movable-execution`),
  not individual files.
- `packages/shared-types` gains the `ServedSessionRoutes` contract type.
- No behavior change. No security model change. No new transport adapter built.
- Implementation is deferred to a follow-up issue; this ADR records the seam
  structure only.
