# ADR-0011: Movable execution (per-thread ownership + handoff)

Status: Accepted (2026-06-26) — documents a concept already implemented and
referenced 14+ times in code; this ADR was missing until now.

## Decision

There are **two** "remote" concepts in peach-pi, and they are functionally
independent. This ADR records the second: **movable execution**.

A thread has exactly one **active owner** at any moment — the single machine
that may steer it. Ownership is time-bounded by a **steering lease** (TTL 60 s,
renewed on every accepted steer); a **takeover** (force-acquire) transfers
ownership to another client. Separately, a user can **hand off** a thread to
another machine (remote-first mode): the branch + checkout travel over SSH to a
target machine, which becomes the new active owner.

This is distinct from ADR-0009's served sessions:

- ADR-0009 — a master *serves* a live `AgentSession` over the tailnet; clients
  *observe* read-only and steer back through a thin forwarder. The session stays
  on the master.
- ADR-0011 (this) — *ownership* of a thread moves between machines. The
  `AgentSession` itself relocates; the previous owner stops running it.

## The two halves of movable execution

Concept B is implemented in two places that share a concept but **not** code,
types, or transport:

1. **Steering lease** (`remote-steering-lease.ts` → `movable-execution/steering-lease.ts`):
   an in-process `Map<ThreadId, LeaseEntry>` held **on the ADR-0009 relay**. It
   gates which attached client may steer a *served* session. TTL 60 s;
   `acquire(force: true)` pre-empts a live holder; `renew()` bumps `expiresAt`;
   `lapseIfExpired()` runs before every access; `assertControl()` returns a
   409-shaped `{status, body}` when blocked.

2. **SSH handoff** (`handoff-service.ts` → `movable-execution/handoff-service.ts`):
   Electron binding over `@peach-pi/remote-handoff`. A kv-backed
   remote-first-mode flag + target machine name + threadId→handoffThreadId
   mapping; `ensureRemoteForThread()` creates/reuses a `HandoffThread` and runs
   `engine.remoteStart(task, {machine})` / `engine.send(...)` over `SshTransport`.

These two halves are **deliberately not unified**. The steering lease is a
short-lived concurrency control for steer-back; the SSH handoff is a branch
relocation. They share a *concept* (who owns the thread) but operate on
different timescales and transports. Forcing a shared type today would be
premature; revisit if they ever need to coordinate (e.g. taking a lease revokes
an SSH handoff).

## Why a separate ADR

- The code already references "ADR-0011" 14+ times (`remote-host.ts:95/97/155/
  446/492/574/593`, `remote-client.ts:129/132/183/194/214/239`,
  `remote-steering-lease.ts:4/12`, `app-service.ts:97-98`) with no doc file.
  This ADR retroactively fills that gap.
- It is the explicit counterpoint to ADR-0009: the "remote" prefix alone does
  not tell you which concept a file serves. ADR-0009 is served-sessions; this
  ADR is movable-execution.
- `handoff-service.ts:24-25` already states the split ("deliberately separate
  from ADR-0009's `RemoteHostService`"); this ADR makes that comment
  authoritative.

## Consequences

- `remote-steering-lease.ts` is concept B despite the `remote-` prefix; it
  belongs behind the movable-execution seam (see ADR-0012), not the
  served-session seam it currently shares a prefix with.
- The lease is stored on the ADR-0009 relay (it gates steer-back to a *served*
  session). The relay imports it from the movable-execution module — physical
  ownership and logical ownership differ. This is acceptable: the lease is pure
  state, no transport, easy to move.
- The SSH handoff arm (`handoff-service.ts`) is the only honestly-named file in
  the cluster today. ADR-0012 makes the rest of the tree honest.
- Lease TTL (60 s) and the `force` takeover semantics are not reopened here;
  they stand as implemented.

## Relationship to ADR-0009/0010

ADR-0009 + ADR-0010 are the served-session relay (read tap + steer-back write
path over the tailnet). Movable execution *uses* the relay's steer-back verbs
when the thread stays served, but the SSH handoff arm does not touch the relay
at all. The two ADRs describe different transports; ADR-0012 describes how the
file tree reflects that.
