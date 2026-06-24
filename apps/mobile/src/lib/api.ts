import type { RemoteSessionInfo, RemoteTapFrame } from "@peach-pi/shared-types";
import type { Master } from "./store.svelte.ts";

/** Base URL for a master's relay. The relay speaks plain HTTP on the tailnet
 *  (ADR-0009 — the tailnet is the security boundary, not TLS). */
export function baseUrl(m: Master): string {
  return `http://${m.host}:${m.port}`;
}

/** Liveness probe. Uses a Bearer header (allowed by the relay's CORS) and a
 *  short timeout so an unreachable master fails fast on the masters list. */
export async function health(m: Master, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl(m)}/health`, {
      headers: { Authorization: `Bearer ${m.token}` },
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function listSessions(m: Master): Promise<RemoteSessionInfo[]> {
  const res = await fetch(`${baseUrl(m)}/sessions`, {
    headers: { Authorization: `Bearer ${m.token}` },
  });
  if (res.status === 401) throw new Error("Unauthorized — check the token.");
  if (!res.ok) throw new Error(`Master returned ${res.status}.`);
  return (await res.json()) as RemoteSessionInfo[];
}

export type TapStatus =
  | { kind: "connecting" }
  | { kind: "live" }
  | { kind: "reconnecting"; fromSeq: number; retryInMs: number }
  | { kind: "ended"; reason: string };

export interface TapHandlers {
  onFrame: (frame: RemoteTapFrame) => void;
  onStatus: (status: TapStatus) => void;
}

/**
 * Reconnecting SSE tap client. EventSource cannot set headers, so the token
 * rides the query string (`?token=`), matching the relay's browser-auth path.
 *
 * Resume: each reconnect passes `?lastSeq=<watermark>` so the master skips
 * frames the client already folded. Backoff is exponential (1s → 30s). The
 * caller persists the watermark via `getSeq` from the frames it folds.
 */
export class TapClient {
  private es: EventSource | null = null;
  private closed = false;
  private retryMs = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly master: Master,
    private readonly threadId: string,
    private lastSeq: number,
    private readonly handlers: TapHandlers,
  ) {}

  start(): void {
    this.connect(true);
  }

  /** Update the resume watermark as the caller folds frames. */
  setLastSeq(seq: number): void {
    this.lastSeq = seq;
  }

  private connect(first: boolean): void {
    if (this.closed) return;
    this.handlers.onStatus(
      first ? { kind: "connecting" } : { kind: "reconnecting", fromSeq: this.lastSeq, retryInMs: this.retryMs },
    );

    const u = new URL(`${baseUrl(this.master)}/tap`);
    u.searchParams.set("threadId", this.threadId);
    u.searchParams.set("token", this.master.token);
    if (this.lastSeq > 0) u.searchParams.set("lastSeq", String(this.lastSeq));

    const es = new EventSource(u.toString());
    this.es = es;

    es.onopen = () => {
      this.retryMs = 1000; // reset backoff on a clean connect
      this.handlers.onStatus({ kind: "live" });
    };

    es.onmessage = (ev) => {
      let frame: RemoteTapFrame;
      try {
        frame = JSON.parse(ev.data) as RemoteTapFrame;
      } catch {
        return; // ignore the ": connected" comment / malformed lines
      }
      this.handlers.onFrame(frame);
      if (frame.kind === "bye") {
        this.handlers.onStatus({ kind: "ended", reason: frame.reason });
        this.close();
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects, but it can't resume from lastSeq or apply
      // backoff — so we own the lifecycle: tear down and schedule our own retry.
      es.close();
      if (this.closed) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.handlers.onStatus({ kind: "reconnecting", fromSeq: this.lastSeq, retryInMs: this.retryMs });
    this.timer = setTimeout(() => this.connect(false), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 30000);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.es?.close();
    this.es = null;
  }
}
