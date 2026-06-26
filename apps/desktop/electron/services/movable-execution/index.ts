/**
 * Movable-execution seam (ADR-0011, seam structure in ADR-0012).
 *
 * The single active owner of a thread at a moment; takeover transfers
 * ownership via a lease, and an SSH handoff arm relocates the branch to
 * another machine. This is the former `remote-*` cluster's "concept B" half.
 *
 * The two halves share a concept but **not** code, types, or transport:
 *
 *  - `steering-lease.ts` — an in-process per-session lease held *on the
 *    served-session relay* (it gates which attached client may steer a served
 *    session). TTL 60 s; force-takeover allowed; pure state machine.
 *  - `handoff-service.ts` — SSH branch handoff via `@peach-pi/remote-handoff`.
 *
 * They are deliberately not unified — the steering lease is a short-lived
 * concurrency control for steer-back; the SSH handoff is a branch relocation.
 * Revisit only if the two ever need to coordinate (ADR-0011).
 */
export { SteeringLeaseStore, LEASE_TTL_MS } from "./steering-lease.ts";
export type { ClientIdentity } from "./steering-lease.ts";
export { HandoffAppService, createHandoffService } from "./handoff-service.ts";
export type { Emit } from "./handoff-service.ts";
