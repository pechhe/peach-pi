import type { HandoffThread } from "./types.ts";

/**
 * Pure lease/ownership logic. The single hard rule of movable execution:
 *
 *   a machine must not mutate a thread unless it owns the lease.
 *
 * These functions are pure (take `now`) so they are trivially testable and
 * deterministic. All persistence lives in the registry; the lease layer only
 * *decides* whether an action is allowed and produces the patched thread.
 */

/** Has the thread's lease lapsed (past its expiry, or never set)? */
export function isExpired(thread: HandoffThread, now: Date): boolean {
  if (!thread.leaseExpiresAt) return true;
  return new Date(thread.leaseExpiresAt).getTime() <= now.getTime();
}

/** The machine that currently holds a live lease, or null if lapsed. */
export function leaseHolder(thread: HandoffThread, now: Date): string | null {
  if (isExpired(thread, now)) return null;
  return thread.leaseOwner;
}

export type TakeOutcome =
  | { ok: true; kind: "already-owner" | "lapsed" | "force" }
  | { ok: false; blocked: true; owner: string };

/** Whether `machine` may take ownership of `thread` right now. */
export function canTake(
  thread: HandoffThread,
  machine: string,
  now: Date,
  force: boolean,
): TakeOutcome {
  if (thread.leaseOwner === machine && !isExpired(thread, now))
    return { ok: true, kind: "already-owner" };
  if (isExpired(thread, now)) return { ok: true, kind: "lapsed" };
  // A live lease on another machine blocks unless forced.
  if (force) return { ok: true, kind: "force" };
  return { ok: false, blocked: true, owner: thread.leaseOwner };
}

/** Only the lease holder may mutate the thread workspace. */
export function canMutate(thread: HandoffThread, machine: string, now: Date): boolean {
  return leaseHolder(thread, now) === machine;
}

/**
 * Acquire (or renew) a lease for `machine`. Pure: returns a new thread object
 * with `activeMachine`, `leaseOwner` and `leaseExpiresAt` set. `ttlMinutes`
 * sets the expiry window.
 */
export function acquireLease(
  thread: HandoffThread,
  machine: string,
  ttlMinutes: number,
  now: Date,
): HandoffThread {
  const expires = new Date(now.getTime() + ttlMinutes * 60_000);
  return {
    ...thread,
    activeMachine: machine,
    leaseOwner: machine,
    leaseExpiresAt: expires.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** Release the lease (pause/idle): clears the live lease, keeps `activeMachine`
 *  so status still reports the last owner. */
export function releaseLease(thread: HandoffThread, now: Date): HandoffThread {
  return {
    ...thread,
    leaseExpiresAt: null,
    status: thread.status === "running" ? "paused" : thread.status,
    pid: null,
    updatedAt: now.toISOString(),
  };
}
