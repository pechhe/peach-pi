import type {
  GitCommitPushResult,
  GitMergeResult,
  GitPrResult,
  RemoteProjectInfo,
  RemoteSessionInfo,
  RemoteTapFrame,
} from "@peach-pi/shared-types";
import type { Master } from "./store.svelte.ts";

/** Base URL for a master's relay.
 *
 * Two shapes are supported:
 * - A full origin (e.g. `https://pche.taila712b2.ts.net`) — used verbatim. This
 *   is the Tailscale Serve path: Serve terminates TLS on the node's MagicDNS
 *   name and proxies to the relay, so the PWA (served over HTTPS) can reach it
 *   without a mixed-content block. Port/scheme are already baked in (443).
 * - A bare host/IP — plain HTTP on the tailnet with the given port (ADR-0009:
 *   the tailnet is the security boundary, not TLS). Works only when the PWA is
 *   itself served over HTTP. */
export function baseUrl(m: Master): string {
  const host = m.host.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(host)) return host;
  return `http://${host}:${m.port}`;
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

async function get<T>(m: Master, path: string): Promise<T> {
  const res = await fetch(`${baseUrl(m)}${path}`, {
    headers: { Authorization: `Bearer ${m.token}` },
  });
  if (res.status === 401) throw new Error("Unauthorized — check the token.");
  if (!res.ok) throw new Error(`Master returned ${res.status}.`);
  return (await res.json()) as T;
}

/** Token-gated write (ADR-0010). Throws on auth / transport / 4xx-5xx so the
 *  caller can surface a single error string. */
async function post<T>(m: Master, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl(m)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${m.token}`,
      "Content-Type": "application/json",
      "X-Pi-Client-Id": m.id,
      "X-Pi-Client-Name": m.name,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    // Surface the server's actual reason. The relay returns JSON like
    // `{ error: "client identity required" }` (missing X-Pi-Client-Id) or
    // `{ error: "controlled by another client", controllerName: "…" }` (409,
    // steering lease held elsewhere) — both were being flattened to a misleading
    // "check the token" message that points at the wrong cause.
    const detail = (await res.json().catch(() => null)) as
      | { error?: string; controllerName?: string | null }
      | null;
    const reason = detail?.error;
    if (reason) {
      const holder = detail?.controllerName;
      throw new Error(holder ? `${reason} (held by ${holder})` : reason);
    }
    if (res.status === 401) throw new Error("Unauthorized — check the token.");
    throw new Error(`Master returned ${res.status}.`);
  }
  return (await res.json()) as T;
}

export function listSessions(m: Master): Promise<RemoteSessionInfo[]> {
  return get<RemoteSessionInfo[]>(m, "/sessions");
}

export function listProjects(m: Master): Promise<RemoteProjectInfo[]> {
  return get<RemoteProjectInfo[]>(m, "/projects");
}

/** Send text: prompt when idle, follow-up queue while running (master decides). */
export function sendMessage(m: Master, threadId: string, text: string): Promise<void> {
  return post(m, `/sessions/${threadId}/message`, { text });
}

export function steerMessage(m: Master, threadId: string, text: string): Promise<void> {
  return post(m, `/sessions/${threadId}/steer`, { text });
}

export function abortRun(m: Master, threadId: string): Promise<void> {
  return post(m, `/sessions/${threadId}/abort`);
}

export function deleteQueued(
  m: Master,
  threadId: string,
  kind: "steer" | "followUp",
  index: number,
): Promise<void> {
  return post(m, `/sessions/${threadId}/queue/delete`, { kind, index });
}

export function createThread(
  m: Master,
  projectId: string,
  opts?: { worktreeId?: string; worktree?: boolean },
): Promise<RemoteSessionInfo> {
  return post<RemoteSessionInfo>(m, "/threads", { projectId, ...opts });
}

export function createChat(m: Master): Promise<RemoteSessionInfo> {
  return post<RemoteSessionInfo>(m, "/chats");
}

export function gitCommitPush(
  m: Master,
  threadId: string,
  message?: string,
): Promise<GitCommitPushResult> {
  return post<GitCommitPushResult>(m, `/sessions/${threadId}/git/commit-push`, { message });
}

export function gitPr(m: Master, threadId: string): Promise<GitPrResult> {
  return post<GitPrResult>(m, `/sessions/${threadId}/git/pr`);
}

export function gitMerge(m: Master, threadId: string): Promise<GitMergeResult> {
  return post<GitMergeResult>(m, `/sessions/${threadId}/git/merge`);
}

/** Snooze a thread until an ISO time (mirrors threads:snooze). */
export function snoozeThread(m: Master, threadId: string, until: string): Promise<void> {
  return post(m, `/sessions/${threadId}/snooze`, { until });
}

/** Clear a snooze (mirrors threads:unsnooze). */
export function unsnoozeThread(m: Master, threadId: string): Promise<void> {
  return post(m, `/sessions/${threadId}/unsnooze`);
}

/** Mark a thread for testing, optionally with a note (mirrors threads:markToTest). */
export function markToTest(m: Master, threadId: string, note?: string): Promise<void> {
  return post(m, `/sessions/${threadId}/mark-to-test`, note ? { note } : undefined);
}

/** Clear a to-test mark (mirrors threads:unmarkToTest). */
export function unmarkToTest(m: Master, threadId: string): Promise<void> {
  return post(m, `/sessions/${threadId}/unmark-to-test`);
}

/** Archive a thread (the controller finishing it marks it done everywhere). */
export function archiveThread(m: Master, threadId: string): Promise<void> {
  return post(m, `/sessions/${threadId}/archive`);
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
    u.searchParams.set("clientId", this.master.id);
    u.searchParams.set("clientName", this.master.name);
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
