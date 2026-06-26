import type { ThreadId } from "@peach-pi/shared-types";

/**
 * Per-session steering lease (ADR-0011): the single client whose steers the
 * master accepts. Auto-acquired on tap attach, auto-lapsed when the tap drops,
 * force-take allowed.
 *
 * Pure state machine: holds a `Map<ThreadId, LeaseEntry>`, applies TTL /
 * force-take / auto-lapse, and returns holder/expiry fields. No HTTP
 * dependency — the relay feeds it a `ClientIdentity` derived from request
 * headers and reads back the `{status, body}`/field shapes its routes need.
 * (ADR-0010: the relay stays a thin forwarder; lease state lives here.)
 */

/** A connected client's identity (read from request headers by the relay). */
export interface ClientIdentity {
  id: string;
  name: string;
}

/** One held lease. `expiresAt` null = no live lease. */
interface LeaseEntry {
  controllerId: string;
  controllerName: string;
  /** Epoch-ms expiry; null = no live lease. */
  expiresAt: number | null;
}

/** Lease TTL: a client holding a thread must be seen (tap heartbeats / a
 *  write) within this window, else the lease lapses so the thread frees up. */
export const LEASE_TTL_MS = 60_000;

export class SteeringLeaseStore {
  private leases = new Map<ThreadId, LeaseEntry>();

  /** The controller fields to merge into a `RemoteSessionInfo` snapshot. */
  fields(threadId: ThreadId): {
    controllerId: string | null;
    controllerName: string | null;
    leaseExpiresAt: string | null;
  } {
    this.lapseIfExpired(threadId);
    const entry = this.leases.get(threadId);
    if (!entry || entry.expiresAt == null) {
      return { controllerId: null, controllerName: null, leaseExpiresAt: null };
    }
    return {
      controllerId: entry.controllerId,
      controllerName: entry.controllerName,
      leaseExpiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }

  /** Drop a lapsed lease (TTL elapsed with no renewal). */
  private lapseIfExpired(threadId: ThreadId): void {
    const e = this.leases.get(threadId);
    if (e && e.expiresAt != null && Date.now() >= e.expiresAt) {
      this.leases.delete(threadId);
    }
  }

  /** Take the steering lease (force = pre-empt a live holder). Returns the new
   *  holder id, or null if blocked. */
  acquire(threadId: ThreadId, client: ClientIdentity, force: boolean): string | null {
    this.lapseIfExpired(threadId);
    const cur = this.leases.get(threadId);
    if (cur && cur.expiresAt != null && cur.controllerId !== client.id && !force) {
      return null; // held by another client, not forced
    }
    this.leases.set(threadId, {
      controllerId: client.id,
      controllerName: client.name,
      expiresAt: Date.now() + LEASE_TTL_MS,
    });
    return client.id;
  }

  /** Release the lease; only the holder may release (others ignored). */
  release(threadId: ThreadId, client: ClientIdentity): void {
    const cur = this.leases.get(threadId);
    if (cur && cur.controllerId === client.id) this.leases.delete(threadId);
  }

  /** Renew a live lease the client holds (taps + writes keep it warm). */
  renew(threadId: ThreadId, client: ClientIdentity): void {
    const cur = this.leases.get(threadId);
    if (cur && cur.controllerId === client.id) {
      cur.expiresAt = Date.now() + LEASE_TTL_MS;
    }
  }

  /** Throws a 409-shaped object if `client` is not the current controller. */
  assertControl(
    threadId: ThreadId,
    client: ClientIdentity | null,
  ): true | { status: number; body: unknown } {
    this.lapseIfExpired(threadId);
    const cur = this.leases.get(threadId);
    if (!client) return { status: 401, body: { error: "client identity required" } };
    if (!cur || cur.expiresAt == null || cur.controllerId !== client.id) {
      return {
        status: 409,
        body: {
          error: "controlled by another client",
          controllerName: cur?.controllerName ?? null,
        },
      };
    }
    // Renew on every accepted steer — the client is actively using it.
    this.renew(threadId, client);
    return true;
  }
}
