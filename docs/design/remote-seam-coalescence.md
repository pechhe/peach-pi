# Design: Coalesce the remote cluster around two named seams

Status: Proposed (for review — issue #31)
Authors: issue #31 exploration
Related ADRs: [ADR-0009](../adr/0009-remote-session-hosting.md),
[ADR-0010](../adr/0010-remote-steer-back-channel.md),
[ADR-0011 (movable execution, concept)](../adr/0011-movable-execution.md) —
previously only a code-comment label with no doc file; this design also writes
the missing ADR-0011 doc.
[ADR-0012 (Seam structure)](../adr/0012-remote-seam-structure.md) (drafted here)

## Problem

The word "remote" is smeared across 7 files (~2040 LOC) in
`apps/desktop/electron/services/`, and two functionally separate concepts are
disambiguated **only by comments**:

- **Concept A — served sessions (ADR-0009 + steer-back ADR-0010).** A master
  machine serves a real `AgentSession` over the tailnet as a read-only tap; an
  attached peach-pi observes it and writes back through the steer verbs.
- **Concept B — movable execution (ADR-0011).** The single machine that *owns* a
  thread at a given moment via a time-bounded lease; takeover transfers
  ownership, and `handoff-service.ts` ships the branch to another machine over
  SSH.

Every file in the cluster carries the `remote-` prefix, so the file tree lies
about which concept it serves:

| File | Concept today | Notes |
|---|---|---|
| `remote-host.ts` | A + **B** (lease store embedded) | ADR-0009 relay + hosts `SteeringLeaseStore` (ADR-0011) |
| `remote-client.ts` | A + B-flavored verbs | ADR-0009 client + settings/pi-config port + `takeControl` |
| `remote-serve.ts` | T (Tailscale transport) | Only Tailscale CLI caller in the cluster |
| `remote-checkpoint.ts` | A (git-as-transport) | ADR-0009 wip branches |
| `remote-steering-lease.ts` | **B** | Pure ADR-0011 state machine — but named `remote-*` |
| `remote-tailnet.ts` | T (bind + token gate) | Security boundary for concept A's relay |
| `handoff-service.ts` | **B** | SSH thread handoff; the *only* file already honestly named |

`handoff-service.ts` already carries the only honest disambiguation in the
codebase (`handoff-service.ts:24-25`):

> *It is deliberately separate from ADR-0009's `RemoteHostService` (session
> hosting over the tailnet relay): remote-first mode is the user-facing "send
> this thread to my other laptop" toggle, not a served-session model.*

Everything else reuses the `remote-` prefix and forces a reader to read comments
to separate the concepts. This design does **not** reopen ADR-0009/0011's
*decisions* — only the **naming** and **seam structure**.

## Proposed seams

Two seams, named after the user-facing capability, not the transport:

### Seam 1 — `served-session` (concept A, ADR-0009/0010)

A master serves its live `AgentSession` over a tailnet HTTP relay; clients
attach read-only and steer back through a thin forwarder. Re-export everything
behind a single barrel so importers never reach into individual files.

Proposed directory:

```
apps/desktop/electron/services/served-session/
  index.ts                  # barrel: re-exports the public surface
  relay-host.ts              # ← remote-host.ts (minus embedded lease — see below)
  relay-client.ts            # ← remote-client.ts (minus settings/pi-config port)
  checkpoint.ts              # ← remote-checkpoint.ts
  tailnet-bind.ts            # ← remote-tailnet.ts
  tailscale-serve.ts         # ← remote-serve.ts (TransportAdapter impl, see §3)
  routes.ts                  # NEW: shared route table + verb contract (see §4)
  http-shared.ts             # NEW: readJsonBody + fetchJson-with-timeout (see §5)
```

Public surface (from `index.ts`):
`RemoteHostService`, `RemoteClientService`, `RelayDeps`, `RelayActions`, plus
the checkpoint helpers and the tailnet bind/token validators.
`RelayActions` and the client verb set are derived from one shared type (§4).

### Seam 2 — `movable-execution` (concept B, ADR-0011)

The single active owner of a thread at a moment; takeover transfers ownership.
Two halves exist today and **do not share code, types, or transport**:

1. `remote-steering-lease.ts` — in-process per-session lease stored **on the
   concept-A relay** (it gates which client may steer a *served* session).
2. `handoff-service.ts` — SSH branch handoff via `@peach-pi/remote-handoff`.

Proposed directory:

```
apps/desktop/electron/services/movable-execution/
  index.ts                   # barrel
  steering-lease.ts          # ← remote-steering-lease.ts (renamed off `remote-`)
  handoff-service.ts         # ← handoff-service.ts (already honestly named)
  lease-contract.ts          # NEW (optional): shared Lease type if (2) below
```

The `handoff-service.ts` filename already says the right thing — it moves as-is
into the new directory with no rename. Only `remote-steering-lease.ts` is
misnamed and is renamed to `steering-lease.ts`.

### Why two seams, not one merged "remote" umbrella

- The transports are genuinely different: A is tailnet HTTP relay; B is SSH
  branch handoff. Merging them under one umbrella would re-smear the same lie.
- Two seams make the file tree self-describing: `served-session/` vs
  `movable-execution/`. A reader no longer needs comments to disambiguate.
- `handoff-service.ts` already proves the pattern works — it is the one honestly
  named file and the one that reads cleanly in isolation.

## Question 1 — merge or split?

**Decision: split into two named seams under `services/`.** Keep them as
sibling directories, not one umbrella directory. Rationale:

- The concepts already travel separately: ADR-0009/0010 vs ADR-0011. Forcing
  them under one `remote/` parent re-introduces the exact smear this issue
  exists to fix.
- Two siblings make the ADR boundary visible in the tree.
- `handoff-service.ts`'s "deliberately separate" comment becomes structural, not
  aspirational.

## Question 2 — rename `handoff-service.ts`?

**Decision: no rename.** It mov**es** into `movable-execution/` with its current
name. The directory does the disambiguating work; the filename already names the
mechanism (`handoff`). Renaming for symmetry's sake would be cosmetic churn.

## Question 3 — transport adapter interface

`remote-serve.ts` is **hard-bound to the Tailscale CLI** (the only shell-out for
transport in the cluster; `remote-host.ts` itself is test-without-tailscale via
injected `setHostHooks`). A second tailnet adapter (ZeroTier, WireGuard) is
plausible in shape but **not realistic for v1**: the security model in
ADR-0009 is explicit that *the tailnet + a shared bearer token are the entire
boundary* and the relay binds only to the Tailscale interface. Swapping the
mesh changes the security argument, not just the transport.

Proposed seam — an interface that `remote-serve.ts` already half-satisfies:

```ts
/** Transport adapter for fronting the served-session relay on a mesh.
 *  v1 has one implementation (Tailscale). The interface exists so a future
 *  ZeroTier/WireGuard adapter can substitute without touching the relay. */
export interface TransportAdapter {
  /**Resolve the mesh-local address the relay must bind to (never 0.0.0.0). */
  resolveBindAddress(): Promise<IfaceAddress[]>;
  /** Front the loopback relay port on the mesh as HTTPS, if the mesh supports it. */
  enableServe(relayPort: number): Promise<void>;
  /** Whether a serve is currently active for the given relay port. */
  serveActiveFor(relayPort: number): Promise<boolean>;
  /** List online mesh peers the user could attach from. */
  listPeers(): Promise<RemoteTailnetPeer[]>;
  /** Human-readable connect info (URL + QR) for the watch PWA. */
  getConnectInfo(opts: { relayPort: number; token: string }): Promise<RemoteConnectInfo>;
}
```

The tailnet-bind helpers (`resolveBindAddress`, `isValidToken`, `IfaceAddress`
from `remote-tailnet.ts`) move into the Tailscale adapter implementation. The
hard-coded `WATCH_APP_URL` and `TS_BINS` candidate paths become adapter config,
not cluster constants. This is the minimum seam to keep the option open without
building a second adapter speculatively (YAGNI — one implementation).

**A second tailnet adapter is not realistic for v1** and we document that
explicitly: the interface exists to localize the Tailscale coupling, not to
invite a second implementation yet.

## Question 4 — shared verb-type for host + client

Today the verb sets are **duplicated, not shared**:

- Server: `RelayActions` interface (`remote-host.ts:108`) — 10 verbs
  (`message`, `steer`, `abort`, `archiveThread`, `deleteQueued`, `createThread`,
  `createChat`, `gitCommitPush`, `gitPr`, `gitMerge`). Route literals live in
  the `handlePost` switch.
- Client: hand-coded methods on `RemoteClientService` carrying
  `(hostId, threadId, …)`. Plus `takeControl`/`releaseControl` which have **no**
  `RelayActions` entry — they hit the relay's lease store directly. Route
  literals duplicated in every `postJson` call.
- Nothing in `packages/shared-types` declares a verb contract.

**Decision: derive both from one shared type.** Add to
`packages/shared-types`:

```ts
/** One-way invocation contract for the served-session relay.
 *  Server implements; client calls. Route literals live in one place. */
export interface ServedSessionRoutes {
  message:      { path: "/sessions/:threadId/message";  body: { text: string } };
  steer:        { path: "/sessions/:threadId/steer";     body: { text: string } };
  abort:        { path: "/sessions/:threadId/abort";     body: Record<string, never> };
  archive:      { path: "/sessions/:threadId/archive";   body: Record<string, never> };
  control:      { path: "/sessions/:threadId/control"; body: { force?: boolean; release?: boolean } };
  deleteQueued: { path: "/sessions/:threadId/queue/delete"; body: { kind: "steer" | "followUp"; index: number } };
  gitCommitPush:{ path: "/sessions/:threadId/git/commit-push"; body: { message?: string } };
  gitPr:        { path: "/sessions/:threadId/git/pr"; body: Record<string, never> };
  gitMerge:     { path: "/sessions/:threadId/git/merge"; body: Record<string, never> };
  createThread: { path: "/threads"; body: { projectId: ProjectId } };
  createChat:   { path: "/chats"; body: Record<string, never> };
}
```

`RelayActions` becomes the server-side function shape derived from this table;
the client's `postJson` paths are derived from the same constants. The
steering `control` verb (currently only on the client + relay lease store)
becomes a first-class entry, closing the "client has verbs the server interface
doesn't declare" gap.

This is a **documented consolidation**, not new behavior — the verbs and routes
already exist identically on both sides.

## Question 5 — does `remote-checkpoint.ts` dissolve?

**Mostly yes, not entirely.** `originUrl()` (`remote-checkpoint.ts:49`) is
already a thin wrapper around `toHttpsRepoUrl` from
`@peach-pi/remote-handoff/git-cli.ts` — the normalizer is already consolidated
there, and `remote-checkpoint.ts` already imports and calls it. What survives is
the `git remote get-url origin` step. That step belongs in
`@peach-pi/remote-handoff`'s git-cli boundary (it's a git-CLI concern, not a
served-session concern), so `originUrl()` moves there and `remote-checkpoint.ts`
drops the helper.

The rest of `remote-checkpoint.ts` (`snapshotToBranch`, `pushCheckpoint`,
`checkpointTip`, `recordCheckpoint`) is ADR-0009-specific git-as-transport and
stays as `served-session/checkpoint.ts`. It does **not** route through
`git-service.snapshot()` — `git-service.snapshot()` would touch HEAD/index, and
ADR-0009's whole point is that checkpoints use a throwaway `GIT_INDEX_FILE` so
they never disturb the agent. They are different recipes for good reason;
consolidating them would reintroduce a hazard ADR-0009 explicitly removed.

## Question 6 — consolidate the fetch-JSON helpers?

**Decision: consolidate into `served-session/http-shared.ts`.** Today there are
4+ variants:

1. `fetchJson` — `usage-adapters.ts:71` (AbortController + `FETCH_TIMEOUT_MS`).
2. Inline copy — `usage-mimo-adapter.ts` (~L70, same timeout constant).
3. Bare `fetch(..., { signal: AbortSignal.timeout(15_000) })` —
   `usage-anthropic-adapter.ts` L70/L108.
4. `getJson`/`postJson` — `remote-client.ts:220/242` (raw `http.request`, no
   timeout).
5. `readJsonBody` — `remote-host.ts` (HTTP body reader, 64 KiB cap).
6. `readJson` — `connector-resolver.ts:157` (no cap), and sync file-based
   `readJson` in `pi-health.ts:74` (different concept, name clash only).

Scope of consolidation — **two helpers, not one**:

- `fetchJsonWithTimeout(url, { headers, timeoutMs, body? })` — for the fetch
  family (usage adapters + remote-client when it can use fetch). Replaces 1–3.
- `readJsonBody(req, { maxBytes })` — for `node:http` `IncomingMessage` bodies.
  Replaces 5 and the `connector-resolver.ts` reader. The `pi-health.ts` sync
  file reader stays (different concept).

The `remote-client.ts` `getJson`/`postJson` switch from raw `http.request` to
`fetch` is in scope for the **follow-up implementation issue**, not this design.
It removes the last transport-family split. A `timeoutMs` becomes mandatory on
the client path (today it has none — a latent hang).

## Non-goals

- Does not reopen ADR-0009 "host from peach-pi itself" or ADR-0011 "lease TTL =
  60s" decisions.
- Does not unify the two halves of concept B (steering lease on the relay vs
  SSH handoff in `handoff-service.ts`). They share a *concept*, not a
  transport; forcing a shared type would be premature. Noted as a possible
  future ADR if the two ever need to coordinate.
- Does not build a second transport adapter. The interface localizes the
  Tailscale coupling; a second impl is YAGNI for v1.
- Does not change the security model (tailnet + bearer token, off by default).

## File-by-file migration summary

| Current | New home | Concept |
|---|---|---|
| `remote-host.ts` | `served-session/relay-host.ts` (lease store extracted) | A |
| `remote-client.ts` | `served-session/relay-client.ts` (settings/pi-config port stays here — it's a served-session client concern) | A |
| `remote-serve.ts` | `served-session/tailscale-serve.ts` (implements `TransportAdapter`) | T |
| `remote-tailnet.ts` | `served-session/tailnet-bind.ts` | T |
| `remote-checkpoint.ts` | `served-session/checkpoint.ts` (`originUrl` → `@peach-pi/remote-handoff`) | A |
| `remote-steering-lease.ts` | `movable-execution/steering-lease.ts` | B |
| `handoff-service.ts` | `movable-execution/handoff-service.ts` (renamed? no — directory does it) | B |
| — (new) | `served-session/routes.ts` (shared verb contract) | A |
| — (new) | `served-session/http-shared.ts` (consolidated fetch + readJsonBody) | A/S |

The steering lease is **extracted** out of `remote-host.ts` (where it's a
private field) into `movable-execution/steering-lease.ts`, and the relay imports
it from there. This makes the concept-B code physically live in the concept-B
directory even though the relay still *uses* it.

## Acceptance criteria mapping

- [x] Design document names the two seams (`served-session`, `movable-execution`)
      and which files live behind each (§"Proposed seams", migration table).
- [x] Transport adapter interface sketched + whether a second tailnet adapter is
      realistic (§Question 3 — interface sketched; **not realistic for v1**).
- [x] Shared verb-type shape proposed for host + client (§Question 4 —
      `ServedSessionRoutes` in `packages/shared-types`).
- [x] ADR drafted covering the seam structure and the ADR-0009/0011 interaction
      (`docs/adr/0011-movable-execution.md` + `docs/adr/0012-remote-seam-structure.md`,
      both drafted alongside).
- [x] Follow-up implementation issue(s) filed referencing this design
      (separate issue, not implemented here).
