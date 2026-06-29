import { randomBytes } from "node:crypto";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  GitCommitPushResult,
  GitMergeResult,
  GitPrResult,
  ImagePayload,
  ModelInfo,
  ProjectId,
  RemoteHostConfig,
  PiConfigPayload,
  PORTABLE_PI_CONFIG_FILES,
  RemoteProjectInfo,
  RemoteSessionInfo,
  RemoteSettingsSnapshot,
  RemoteTapFrame,
  RosterFrame,
  ScopedModel,
  SessionMeta,
  ThreadId,
  ThreadStatus,
  ThinkingLevel,
  TranscriptDelta,
  TranscriptSnapshot,
} from "@peach-pi/shared-types";
import { resolveBindAddress, isValidToken, type IfaceAddress } from "./tailnet-bind.ts";
import { checkpointTip } from "./checkpoint.ts";
import { readJsonBody } from "./http-shared.ts";

/** Valid ThinkingLevel values, for validating the optional `message` override. */
const ThinkingLevels = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

/** Image MIME types the mobile composer may attach to a message (ADR-0011). */
const SUPPORTED_IMAGE_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
import { originUrl } from "@peach-pi/remote-handoff";
// ADR-0011: the steering lease lives behind the movable-execution seam. The
// relay imports it (concept-B state physically lives in concept-B's directory
// even though the relay still uses it — physical ownership ≠ logical ownership).
import {
  SteeringLeaseStore,
  LEASE_TTL_MS,
  type ClientIdentity,
} from "../movable-execution/steering-lease.ts";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "peach-remote-host.json");

/** Open CORS so the mobile PWA (a different origin) can read responses.
 *  Responses stay token-gated, so this widens reachability, not trust. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
} as const;

/**
 * Master-side relay (ADR-0009). Serves served sessions over the tailnet via
 * plain HTTP + Server-Sent Events (no `ws` dependency; same node:http precedent
 * as ConnectorResolver). The conversation tap is a SECOND SUBSCRIBER to the
 * same `event:transcript` / `event:sessionMeta` payloads the local renderer
 * gets — the running AgentSession is the host, no RPC subprocess.
 *
 * Security: binds ONLY to the Tailscale interface (never 0.0.0.0), requires a
 * shared bearer token, and is OFF by default. Transcripts cannot be redacted,
 * so the tailnet boundary is the entire security model (ADR-0009).
 *
 * Surface (read path, ADR-0009):
 *   GET  /health                     → { ok: true }
 *   GET  /sessions                   → RemoteSessionInfo[]
 *   GET  /projects                   → RemoteProjectInfo[]
 *   GET  /tap?threadId=&lastSeq=     → SSE stream of RemoteTapFrame
 *   GET  /models                     → ScopedModel[] (mobile composer picker)
 *   GET  /sessions/:id/meta           → SessionMeta (current model + thinking)
 *
 * Write path (ADR-0010, token-gated, same boundary as reads):
 *   POST /sessions/:id/message  { text, model?, thinking? }  → prompt | follow-up
 *   POST /sessions/:id/steer    { text }  → immediate steer
 *   POST /sessions/:id/abort              → stop the running turn
 *   POST /sessions/:id/queue/delete { kind, index }
 *   POST /threads               { projectId } → RemoteSessionInfo
 *   POST /chats                           → RemoteSessionInfo
 *   POST /sessions/:id/git/commit-push { message? } → GitCommitPushResult
 *   POST /sessions/:id/git/pr             → GitPrResult
 *   POST /sessions/:id/git/merge          → GitMergeResult
 *
 * Browser clients (the mobile PWA, ADR-0009 follow-up): EventSource cannot set
 * an Authorization header, so the token may ALSO be passed as a `?token=` query
 * param, and CORS is opened (`Access-Control-Allow-Origin: *`). Responses stay
 * token-gated, so this widens reachability, not trust — the tailnet + token are
 * still the entire security model.
 */
export interface RelayDeps {
  /** Authoritative transcript snapshot for a thread (backfill on attach). */
  transcript: (threadId: ThreadId) => Promise<TranscriptSnapshot>;
  /** All threads, for /sessions listing and project-membership checks. */
  threads: () => {
    id: ThreadId;
    title: string;
    status: string;
    projectId: ProjectId | null;
    archivedAt?: string;
    snoozedUntil?: string | null;
    toTestAt?: string | null;
    toTestNote?: string | null;
  }[];
  /** Working dir for a thread (to read checkpoint + origin). */
  threadCwd: (threadId: ThreadId) => string | null;
  /** Served projects, for the phone's new-thread picker. */
  projects: () => RemoteProjectInfo[];
  /** Behavioral settings the client adopts on connect (ADR-0011). */
  settings: () => Promise<RemoteSettingsSnapshot>;
  /** Allowlisted pi-config files, ported wholesale on connect (ADR-0011). */
  piConfig: () => Promise<PiConfigPayload>;
  /** Auth-configured models (the master's scoped catalog) for the mobile
   *  composer's model picker (ADR-0011 mobile composer). */
  models: () => Promise<ScopedModel[]>;
  /** Live session meta (current model + thinking + context) for a thread,
   *  surfaced so the mobile composer can reflect the master's current state. */
  meta: (threadId: ThreadId) => Promise<SessionMeta>;
  /** Write-path verbs (ADR-0010). Thin forwarders to thread/git services. */
  actions: RelayActions;
  /** Override interface lookup for tests. */
  interfaces?: () => Record<string, IfaceAddress[]>;
}

/** The steer-back verbs (ADR-0010). The relay holds no logic of its own; it
 *  forwards to the same thread-service / git-service the desktop renderer uses.
 *  Each returns a JSON-serialisable result the phone renders. */
export interface RelayActions {
  /** Send text: prompt when idle, queue a follow-up while running. `opts`
   *  lets a remote composer override the session's model/thinking for the
   *  next prompt (mobile composer, ADR-0011); omitted = keep session state. */
  message: (
    threadId: ThreadId,
    text: string,
    opts?: { model?: ModelInfo; thinking?: ThinkingLevel; images?: ImagePayload[] },
  ) => Promise<void>;
  /** Immediate steer of a running turn. */
  steer: (threadId: ThreadId, text: string) => Promise<void>;
  /** Stop the running turn. */
  abort: (threadId: ThreadId) => Promise<void>;
  /** Archive a thread — the controller finishing it marks it done everywhere. */
  archiveThread: (threadId: ThreadId) => Promise<void>;
  /** Snooze a thread until an ISO time (mirrors threads:snooze). */
  snoozeThread: (threadId: ThreadId, until: string) => Promise<void>;
  /** Clear a snooze (mirrors threads:unsnooze). */
  unsnoozeThread: (threadId: ThreadId) => Promise<void>;
  /** Mark a thread for testing, optionally with a note (mirrors threads:markToTest). */
  markToTest: (threadId: ThreadId, note?: string) => Promise<void>;
  /** Clear a to-test mark (mirrors threads:unmarkToTest). */
  unmarkToTest: (threadId: ThreadId) => Promise<void>;
  /** Drop a queued message by lane + index. */
  deleteQueued: (threadId: ThreadId, kind: "steer" | "followUp", index: number) => Promise<void>;
  /** Start a new thread in a served project; returns its id. `opts.worktreeId`
   *  starts the thread in an existing worktree; `opts.worktree: true` mints a
   *  fresh worktree first; no opts = the project's main checkout (local). */
  createThread: (
    projectId: ProjectId,
    opts?: { worktreeId?: string; worktree?: boolean },
  ) => Promise<ThreadId>;
  /** Start a new chat (no repo); returns its id. */
  createChat: () => Promise<ThreadId>;
  gitCommitPush: (threadId: ThreadId, message?: string) => Promise<GitCommitPushResult>;
  gitPr: (threadId: ThreadId) => Promise<GitPrResult>;
  gitMerge: (threadId: ThreadId) => Promise<GitMergeResult>;
}

/** Read a client's identity from `X-Pi-Client-Id` / `X-Pi-Client-Name`, with
 *  `?clientId=`/`?clientName=` query fallback for browser EventSource (which
 *  cannot set headers) — same pattern the token rides the query string. */
function readClient(req: IncomingMessage, url: URL): ClientIdentity | null {
  const id =
    (typeof req.headers["x-pi-client-id"] === "string" && req.headers["x-pi-client-id"]) ||
    url.searchParams.get("clientId");
  if (!id) return null;
  const name =
    (typeof req.headers["x-pi-client-name"] === "string" && req.headers["x-pi-client-name"]) ||
    url.searchParams.get("clientName") ||
    "client";
  return { id, name };
}

export class RemoteHostService {
  private server: Server | null = null;
  /** Loopback twin of `server`, on the same port. Tailscale Serve on macOS can
   *  only proxy to a localhost target (not the node's own tailnet IP), so we
   *  also listen on 127.0.0.1 to let Serve front the relay with HTTPS. Local
   *  only — never an off-machine exposure, so it doesn't widen the boundary. */
  private loopback: Server | null = null;
  private port = 0;
  private bindIp: string | null = null;
  private token = randomBytes(24).toString("hex");
  private enabled = false;
  /** SSE listeners per thread: late-joiners get a backfill, all get the tail. */
  private listeners = new Map<ThreadId, Set<ServerResponse>>();
  /** Roster SSE listeners (the phone's sessions list). Each gets a full
   *  snapshot on connect, then incremental snapshots on roster-shape changes
   *  (status flip, checkpoint, create/archive/snooze, lease handoff). Separate
   *  from the per-thread tap because one subscriber covers every served thread. */
  private rosterListeners = new Set<ServerResponse>();
  /** "Serve all projects" shortcut — when true, current AND future projects
   *  are served; `servedProjects` is ignored. Defaults to true so a new install
   *  exposes everything to the tailnet without extra configuration. */
  private serveAll = true;
  /** Explicitly served project ids (only consulted when !serveAll). */
  private servedProjects = new Set<ProjectId>();
  /** Per-session steering lease (ADR-0011). Pure state machine extracted out
   *  of the relay (ADR-0010: the relay stays a thin forwarder, no logic). */
  private leases = new SteeringLeaseStore();

  private deps: RelayDeps;
  /** Fronts the relay with Tailscale Serve HTTPS so the watch app can reach it
   *  without a separate step. Injected so tests don't shell out to tailscale.
   *  Null = Tailscale unavailable; enableServe failures are surfaced via
   *  connectInfo (serveActive=false) in the UI. */
  private enableServe?: (relayPort: number) => Promise<void>;
  /** Notifies the renderer that serving state changed (event:remoteHostStatus).
   *  Injected so the relay stays free of the typed-Emit coupling. */
  private onStatusChange?: () => void;

  constructor(deps: RelayDeps) {
    this.deps = deps;
  }

  /** Wire the Tailscale-Serve fronting hook + status-change notifier (main.ts
   *  composes these after construction so the relay's core stays testable
   *  without the tailscale CLI or the typed emitter). */
  setHostHooks(hooks: {
    enableServe?: (relayPort: number) => Promise<void>;
    onStatusChange?: () => void;
  }): void {
    this.enableServe = hooks.enableServe;
    this.onStatusChange = hooks.onStatusChange;
  }

  async status(): Promise<RemoteHostConfig> {
    return {
      enabled: this.enabled,
      token: this.token,
      port: this.port,
      bindIp: this.bindIp,
      serveAll: this.serveAll,
      servedProjects: [...this.servedProjects],
    };
  }

  /** Load persisted config (token + served-project selection) on boot; does
   *  not auto-start serving. */
  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as {
        token?: string;
        serveAll?: boolean;
        servedProjects?: string[];
      };
      if (isValidToken(raw.token)) this.token = raw.token;
      if (typeof raw.serveAll === "boolean") this.serveAll = raw.serveAll;
      if (Array.isArray(raw.servedProjects)) {
        this.servedProjects = new Set(raw.servedProjects);
      }
    } catch {
      // No persisted config yet — keep defaults.
    }
  }

  async persist(): Promise<void> {
    await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
    await writeFile(
      CONFIG_PATH,
      JSON.stringify(
        {
          token: this.token,
          serveAll: this.serveAll,
          servedProjects: [...this.servedProjects],
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  /** True only when the relay has actually been started (`start()`). Checkpoint
   *  pushes must gate on this — being "served" is config intent, not an active
   *  host, and we must never push `wip/<id>` branches while hosting is off. */
  isActive(): boolean {
    return this.enabled;
  }

  /** Is a given thread currently served? A thread is served iff it belongs to a
   *  served project. Chats (projectId null) are never served in v1 (no repo,
   *  no checkpoint to pull). `serveAll` opts into every current + future project. */
  isServedThread(threadId: ThreadId): boolean {
    const t = this.deps.threads().find((x) => x.id === threadId);
    if (!t || !t.projectId) return false;
    return this.isServedProject(t.projectId);
  }

  /** Is a project currently served? `serveAll` opts into every project. */
  isServedProject(projectId: ProjectId): boolean {
    return this.serveAll || this.servedProjects.has(projectId);
  }

  /** Toggle the "serve all projects" shortcut. Disabling it re-evaluates
   *  membership and kicks any listener whose thread is no longer served. */
  setServeAll(serveAll: boolean): void {
    const expanded = serveAll && !this.serveAll;
    this.serveAll = serveAll;
    this.kickUnservedListeners();
    if (expanded) this.prewarmServed();
  }

  /** Add/remove a project from the served set. Kicks listeners on a
   *  just-un-served project's threads. */
  setProjectServed(projectId: ProjectId, served: boolean): void {
    if (served) {
      this.servedProjects.add(projectId);
      this.prewarmServed();
    } else {
      this.servedProjects.delete(projectId);
      this.kickUnservedListeners();
    }
  }

  /** Prewarm PiSessions for served threads so a tap connect hits the warm
   *  fast path instead of cold-starting the pi SDK + JSONL parse inside the
   *  SSE handler. Fire-and-forget; errors are swallowed — a failed prewarm
   *  just means the tap path cold-starts as before. No-op for already-warm
   *  sessions (transcript() is an in-memory flush). */
  private prewarmServed(): void {
    for (const t of this.deps.threads()) {
      if (t.archivedAt) continue;
      if (!this.isServedThread(t.id)) continue;
      void this.deps.transcript(t.id).catch(() => {});
    }
  }

  /** Disconnect any SSE listener whose thread is no longer served (e.g. after
   *  a project was un-served or serveAll was turned off). */
  private kickUnservedListeners(): void {
    for (const [threadId, set] of this.listeners) {
      if (!this.isServedThread(threadId)) {
        set.forEach((res) => res.end());
        this.listeners.delete(threadId);
      }
    }
  }

  /** Begin serving. Resolves the tailnet IP and binds to it; rejects (throws)
   *  if no tailnet interface is present. Idempotent. */
  async start(): Promise<RemoteHostConfig> {
    if (this.server) {
      this.enabled = true;
      return this.status();
    }
    const resolved = resolveBindAddress({}, this.deps.interfaces);
    if ("reject" in resolved) throw new Error(resolved.reject);
    this.bindIp = resolved.bindIp;
    const server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port || 0, this.bindIp!, () => {
        server.removeListener("error", reject);
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : this.port;
        this.server = server;
        this.enabled = true;
        resolve();
      });
    });
    // Loopback twin on the same port (best-effort) for Tailscale Serve to proxy.
    await this.startLoopback();
    // Prewarm PiSessions for served threads so a tap connect hits the warm
    // fast path instead of cold-starting the pi SDK + JSONL parse inside the
    // SSE handler (1-3s for moderate threads). Fire-and-forget.
    this.prewarmServed();
    return this.status();
  }

  /** Bind a localhost-only twin of the relay on the resolved port so Tailscale
   *  Serve (which can't target the tailnet IP on macOS) can proxy HTTPS to it.
   *  Best-effort: a failure here never blocks plain-HTTP tailnet serving. */
  private async startLoopback(): Promise<void> {
    if (this.loopback || !this.port) return;
    const lo = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => {
      lo.once("error", () => resolve()); // port busy / sandboxed — skip silently
      lo.listen(this.port, "127.0.0.1", () => {
        lo.removeAllListeners("error");
        this.loopback = lo;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const s = this.server;
    const lo = this.loopback;
    this.server = null;
    this.loopback = null;
    this.enabled = false;
    this.listeners.forEach((set) => set.forEach((res) => res.end()));
    this.listeners.clear();
    this.rosterListeners.forEach((res) => res.end());
    this.rosterListeners.clear();
    if (lo) await new Promise<void>((r) => lo.close(() => r()));
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }

  /** Inject a transcript delta from thread-service's emit stream (the tap). */
  forwardTranscript(delta: TranscriptDelta): void {
    if (!this.server || !this.isServedThread(delta.threadId)) return;
    const frame: RemoteTapFrame = {
      kind: "transcript",
      threadId: delta.threadId,
      ops: delta.ops,
      seq: delta.seq,
    };
    this.broadcast(delta.threadId, frame);
  }

  /** Inject a checkpoint frame. */
  forwardCheckpoint(threadId: ThreadId, sha: string): void {
    if (!this.isServedThread(threadId)) return;
    this.broadcast(threadId, {
      kind: "checkpoint",
      threadId,
      sha,
      at: new Date().toISOString(),
    });
    void this.forwardRoster();
  }

  /** Inject a run-status frame so the phone composer morphs send↔stop. */
  forwardStatus(threadId: ThreadId, status: ThreadStatus): void {
    if (!this.server || !this.isServedThread(threadId)) return;
    this.broadcast(threadId, { kind: "status", threadId, status });
    void this.forwardRoster();
  }

  /** Inject a queue frame so the phone shows the steer/follow-up backlog. */
  forwardQueue(threadId: ThreadId, steering: string[], followUp: string[]): void {
    if (!this.server || !this.isServedThread(threadId)) return;
    this.broadcast(threadId, { kind: "queue", threadId, steering, followUp });
    void this.forwardRoster();
  }

  /** Build the full served-thread roster. Shared by `GET /sessions` and the
   *  roster tap so they can never drift in shape. */
  private async buildRoster(): Promise<RemoteSessionInfo[]> {
    const sessions: RemoteSessionInfo[] = [];
    for (const t of this.deps.threads()) {
      if (t.archivedAt) continue;
      if (!this.isServedThread(t.id)) continue;
      const info = await this.sessionInfo(t.id);
      if (info) sessions.push(info);
    }
    return sessions;
  }

  /** Push a full roster snapshot to every sessions-list listener. Fire-and-
   *  forget from the synchronous per-thread forwards (status/queue/checkpoint);
   *  awaited from POST mutations so a 200 reflects the new roster having been
   *  pushed. No-op when the server is unbound or nobody is listening. Public so
   *  the host wiring (and tests) can also force a flush after bulk changes. */
  async forwardRoster(): Promise<void> {
    if (!this.server || this.rosterListeners.size === 0) return;
    const sessions = await this.buildRoster();
    const frame: RosterFrame = { kind: "roster", sessions };
    const line = `data: ${JSON.stringify(frame)}\n\n`;
    for (const res of this.rosterListeners) {
      try {
        res.write(line);
      } catch {
        this.rosterListeners.delete(res);
      }
    }
  }

  private broadcast(threadId: ThreadId, frame: RemoteTapFrame): void {
    const set = this.listeners.get(threadId);
    if (!set) return;
    const line = `data: ${JSON.stringify(frame)}\n\n`;
    for (const res of set) {
      try {
        res.write(line);
      } catch {
        set.delete(res);
      }
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${this.bindIp ?? "127.0.0.1"}`);
      // CORS preflight carries no credentials — answer it before the auth gate.
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        return void res.end();
      }
      if (!this.checkAuth(req, url)) return this.send(res, 401, { error: "unauthorized" });

      if (req.method === "GET" && url.pathname === "/health") {
        return this.send(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/sessions") {
        return this.send(res, 200, await this.buildRoster());
      }

      if (req.method === "GET" && url.pathname === "/projects") {
        const served = this.deps.projects().filter((p) => this.isServedProject(p.id));
        return this.send(res, 200, served);
      }

      if (req.method === "GET" && url.pathname === "/settings") {
        return this.send(res, 200, await this.deps.settings());
      }

      if (req.method === "GET" && url.pathname === "/pi-config") {
        return this.send(res, 200, await this.deps.piConfig());
      }

      // Mobile composer catalog (ADR-0011): the master's auth-configured models
      // so the phone can pick model + reasoning like the Codex mobile app.
      if (req.method === "GET" && url.pathname === "/models") {
        return this.send(res, 200, await this.deps.models());
      }

      // Live session meta (model/thinking/context) for a thread, so the
      // composer can reflect the master's current selection.
      if (req.method === "GET" && /^\/sessions\/[^/]+\/meta$/.test(url.pathname)) {
        const seg = url.pathname.split("/").filter(Boolean);
        const threadId = seg[1] as ThreadId;
        if (!this.isServedThread(threadId))
          return this.send(res, 404, { error: "thread's project is not served" });
        if (!this.checkAuth(req, url)) return this.send(res, 401, { error: "unauthorized" });
        return this.send(res, 200, await this.deps.meta(threadId));
      }

      if (req.method === "GET" && url.pathname === "/tap") {
        return this.handleTap(req, res, url);
      }

      if (req.method === "GET" && url.pathname === "/roster") {
        return this.handleRosterTap(req, res);
      }

      if (req.method === "POST") {
        return this.handlePost(req, res, url);
      }

      return this.send(res, 404, { error: "not found" });
    } catch (err) {
      return this.send(res, 500, { error: String(err) });
    }
  }

  /** SSE tap: backfill the transcript, then stream live frames. */
  private async handleTap(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const threadId = url.searchParams.get("threadId");
    if (!threadId) return this.send(res, 400, { error: "threadId required" });
    if (!this.isServedThread(threadId))
      return this.send(res, 404, { error: "thread's project is not served" });

    // Auto-acquire the steering lease on attach (force-take; ADR-0011) so the
    // client opening the thread is the controller. Released on tap close.
    const client = readClient(req, url);
    if (client) this.leases.acquire(threadId, client, true);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    });
    res.write(": connected\n\n");

    // Backfill the full transcript so a late-joiner has full context. The
    // snapshot carries the flush boundary `seq`; the client replays only
    // frames with seq > this on top (the renderer store already does this).
    try {
      const snap = await this.deps.transcript(threadId);
      const backfill: RemoteTapFrame = {
        kind: "backfill",
        threadId,
        items: snap.items,
        seq: snap.seq,
      };
      res.write(`data: ${JSON.stringify(backfill)}\n\n`);
    } catch {
      // No session yet — stream starts empty; live frames will arrive.
    }

    // Seed the current run-status so the phone composer renders send/stop
    // correctly before any transition fires (status frames are edge-triggered).
    const t = this.deps.threads().find((x) => x.id === threadId);
    if (t) {
      const seed: RemoteTapFrame = {
        kind: "status",
        threadId,
        status: t.status as ThreadStatus,
      };
      res.write(`data: ${JSON.stringify(seed)}\n\n`);
    }

    const set = this.listeners.get(threadId) ?? new Set<ServerResponse>();
    set.add(res);
    this.listeners.set(threadId, set);

    // Keep the lease warm while the tap is live; release it when the tap drops
    // (so the thread frees up for another client — ADR-0011 auto-lapse).
    const renew = client ? setInterval(() => this.leases.renew(threadId, client), Math.floor(LEASE_TTL_MS / 2)) : null;
    reqCloseHandler(req, () => {
      set.delete(res);
      if (renew) clearInterval(renew);
      if (client) this.leases.release(threadId, client);
      try {
        res.end();
      } catch {
        // already closed
      }
    });
  }

  /** SSE roster tap: seed the full served-thread list, then stream full
   *  snapshots on roster-shape changes. The phone's sessions list replaces its
   *  cache on each frame (small payload, no delta reconciliation). */
  private async handleRosterTap(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    });
    res.write(": connected\n\n");

    // Seed the full roster so a late-joiner renders immediately.
    try {
      const frame: RosterFrame = { kind: "roster", sessions: await this.buildRoster() };
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    } catch {
      // Threads unavailable — live snapshots will arrive as state changes.
    }

    this.rosterListeners.add(res);
    reqCloseHandler(req, () => {
      this.rosterListeners.delete(res);
      try {
        res.end();
      } catch {
        // already closed
      }
    });
  }

  /** Build the public session info for one thread (shared by /sessions and the
   *  POST /threads + /chats responses). Null when the thread vanished. */
  private async sessionInfo(threadId: ThreadId): Promise<RemoteSessionInfo | null> {
    const t = this.deps.threads().find((x) => x.id === threadId);
    if (!t) return null;
    const cwd = this.deps.threadCwd(threadId);
    const sha = cwd ? await checkpointTip(cwd, threadId) : null;
    const projectName = t.projectId
      ? this.deps.projects().find((p) => p.id === t.projectId)?.name ?? null
      : null;
    return {
      threadId: t.id,
      title: t.title,
      status: t.status as RemoteSessionInfo["status"],
      projectId: t.projectId,
      projectName,
      originUrl: cwd ? await originUrl(cwd) : null,
      lastCheckpointSha: sha,
      lastCheckpointAt: null,
      ...this.leaseFields(threadId),
      archived: !!t.archivedAt,
      snoozedUntil: t.snoozedUntil ?? null,
      toTestAt: t.toTestAt ?? null,
      toTestNote: t.toTestNote ?? null,
    };
  }

  /** The controller fields to merge into a `RemoteSessionInfo` snapshot. */
  private leaseFields(threadId: ThreadId): {
    controllerId: string | null;
    controllerName: string | null;
    leaseExpiresAt: string | null;
  } {
    return this.leases.fields(threadId);
  }

  /** Write path (ADR-0010). Routes a token-gated POST to a RelayActions verb.
   *  Per-thread routes require the thread's project to be served, mirroring the
   *  read path's gate. */
  private async handlePost(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const a = this.deps.actions;
    const seg = url.pathname.split("/").filter(Boolean); // e.g. ["sessions","<id>","git","pr"]
    const body = await readJsonBody(req);

    // Create routes (no thread to gate on — project membership checked inside).
    if (seg.length === 1 && seg[0] === "threads") {
      const projectId = String(body.projectId ?? "");
      if (!projectId) return this.send(res, 400, { error: "projectId required" });
      if (!this.isServedProject(projectId as ProjectId))
        return this.send(res, 404, { error: "project is not served" });
      const opts: { worktreeId?: string; worktree?: boolean } = {};
      if (typeof body.worktreeId === "string" && body.worktreeId)
        opts.worktreeId = body.worktreeId;
      else if (body.worktree === true) opts.worktree = true;
      const id = await a.createThread(projectId as ProjectId, opts);
      await this.forwardRoster();
      return this.send(res, 200, await this.sessionInfo(id));
    }
    if (seg.length === 1 && seg[0] === "chats") {
      const id = await a.createChat();
      await this.forwardRoster();
      return this.send(res, 200, await this.sessionInfo(id));
    }

    // Per-thread routes: /sessions/:id/...
    if (seg[0] !== "sessions" || seg.length < 3) {
      return this.send(res, 404, { error: "not found" });
    }
    const threadId = seg[1] as ThreadId;
    if (!this.isServedThread(threadId))
      return this.send(res, 404, { error: "thread's project is not served" });
    const rest = seg.slice(2).join("/");
    const client = readClient(req, url);

    switch (rest) {
      case "control": {
        // POST /sessions/:id/control — take (default) or release the steering
        //  lease (ADR-0011). Take force-pre-empts a live holder. Auto-invoked
        //  on attach; also the top-bar Take control / Hand back action.
        if (!client) return this.send(res, 401, { error: "client identity required" });
        if (body.release === true) {
          this.leases.release(threadId, client);
          await this.forwardRoster();
          return this.send(res, 200, { ok: true, ...this.leaseFields(threadId) });
        }
        const force = body.force !== false; // default true
        const held = this.leases.acquire(threadId, client, force);
        if (!held) {
          return this.send(res, 409, {
            error: "controlled by another client",
            controllerName: this.leases.fields(threadId).controllerName,
          });
        }
        await this.forwardRoster();
        return this.send(res, 200, { ok: true, ...this.leaseFields(threadId) });
      }
      case "archive": {
        // POST /sessions/:id/archive — the controller finishing a thread marks
        // it done; the master archives it so every client drops it (ADR-0011).
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await this.deps.actions.archiveThread(threadId);
        await this.forwardRoster();
        return this.send(res, 200, { ok: true });
      }
      case "snooze": {
        // POST /sessions/:id/snooze — snooze the thread until an ISO time.
        const until = String(body.until ?? "").trim();
        if (!until) return this.send(res, 400, { error: "until required" });
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await this.deps.actions.snoozeThread(threadId, until);
        await this.forwardRoster();
        return this.send(res, 200, { ok: true });
      }
      case "unsnooze": {
        // POST /sessions/:id/unsnooze — clear a snooze.
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await this.deps.actions.unsnoozeThread(threadId);
        await this.forwardRoster();
        return this.send(res, 200, { ok: true });
      }
      case "mark-to-test": {
        // POST /sessions/:id/mark-to-test — flag for testing, optional note.
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await this.deps.actions.markToTest(
          threadId,
          typeof body.note === "string" ? body.note : undefined,
        );
        await this.forwardRoster();
        return this.send(res, 200, { ok: true });
      }
      case "unmark-to-test": {
        // POST /sessions/:id/unmark-to-test — clear a to-test mark.
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await this.deps.actions.unmarkToTest(threadId);
        await this.forwardRoster();
        return this.send(res, 200, { ok: true });
      }
      case "message": {
        const text = String(body.text ?? "").trim();
        if (!text) return this.send(res, 400, { error: "text required" });
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        // Optional per-send override (mobile composer, ADR-0011). Only forward
        //  a well-shaped ModelInfo/ThinkingLevel; ignore junk rather than 400 —
        //  a stale client shouldn't lose its message.
        const opts: { model?: ModelInfo; thinking?: ThinkingLevel; images?: ImagePayload[] } = {};
        const m = body.model;
        if (m && typeof m === "object" && typeof m.provider === "string" && typeof m.id === "string" && typeof m.name === "string") {
          opts.model = { provider: m.provider, id: m.id, name: m.name };
        }
        const t = body.thinking;
        if (typeof t === "string" && ThinkingLevels.has(t)) opts.thinking = t as ThinkingLevel;
        // Images pasted/dropped in the mobile composer (ADR-0011). Validate
        //  shape + cap count/size so a hostile client can't exhaust memory;
        //  malformed entries are dropped, not 400'd.
        const imgs = Array.isArray(body.images) ? body.images : [];
        const images: ImagePayload[] = [];
        for (const img of imgs) {
          if (images.length >= 8) break;
          if (!img || typeof img !== "object") continue;
          const mimeType = typeof img.mimeType === "string" ? img.mimeType : "";
          const data = typeof img.data === "string" ? img.data : "";
          if (!SUPPORTED_IMAGE_MIME.has(mimeType)) continue;
          // ~10MB base64 cap per image — keeps the relay body bounded.
          if (data.length > 14_000_000) continue;
          images.push({ mimeType, data });
        }
        if (images.length) opts.images = images;
        await a.message(threadId, text, Object.keys(opts).length ? opts : undefined);
        return this.send(res, 200, { ok: true });
      }
      case "steer": {
        const text = String(body.text ?? "").trim();
        if (!text) return this.send(res, 400, { error: "text required" });
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await a.steer(threadId, text);
        return this.send(res, 200, { ok: true });
      }
      case "abort": {
        const guard = this.leases.assertControl(threadId, client);
        if (guard !== true) return this.send(res, guard.status, guard.body);
        await a.abort(threadId);
        return this.send(res, 200, { ok: true });
      }
      case "queue/delete": {
        const kind = body.kind === "steer" ? "steer" : "followUp";
        const index = Number(body.index);
        if (!Number.isInteger(index) || index < 0)
          return this.send(res, 400, { error: "index required" });
        await a.deleteQueued(threadId, kind, index);
        return this.send(res, 200, { ok: true });
      }
      case "git/commit-push":
        return this.send(res, 200, await a.gitCommitPush(threadId, body.message ? String(body.message) : undefined));
      case "git/pr":
        return this.send(res, 200, await a.gitPr(threadId));
      case "git/merge":
        return this.send(res, 200, await a.gitMerge(threadId));
      default:
        return this.send(res, 404, { error: "not found" });
    }
  }

  private checkAuth(req: IncomingMessage, url: URL): boolean {
    return authorizeRequest(
      this.token,
      req.headers.authorization,
      url.searchParams.get("token"),
    );
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(body));
  }

  /** Toggle serving on/off and front the relay with Tailscale Serve HTTPS
   *  on enable. Choreography that previously leaked across the IPC seam into
   *  main.ts's `remote:setHostEnabled` handler (ADR: sink orchestrators into
   *  the service that owns the responsibility). Swallowed Tailscale failures
   *  surface via connectInfo (serveActive=false) rather than throwing. */
  async setHostEnabled(enabled: boolean): Promise<RemoteHostConfig> {
    if (enabled) await this.start();
    else await this.stop();
    if (enabled) {
      try {
        const s = await this.status();
        await this.enableServe?.(s.port);
      } catch {
        // Tailscale missing / not logged in — UI shows the QR once Serve comes up.
      }
    }
    this.onStatusChange?.();
    return this.status();
  }

  async regenerateToken(): Promise<string> {
    this.token = randomBytes(24).toString("hex");
    await this.persist();
    return this.token;
  }
}

function reqCloseHandler(req: IncomingMessage, fn: () => void): void {
  req.on("close", fn);
}

/** Pure auth gate (so it's testable without binding the tailnet socket).
 *  A request is authorized iff the relay has a valid token AND the caller
 *  presents it — either as `Authorization: Bearer <token>` (native/desktop
 *  clients) or as a `?token=<token>` query param (browser EventSource, which
 *  cannot set headers). Both carry the same token over the same tailnet. */
export function authorizeRequest(
  token: string,
  authHeader: string | undefined,
  queryToken: string | null,
): boolean {
  if (!isValidToken(token)) return false;
  if ((authHeader ?? "") === `Bearer ${token}`) return true;
  return queryToken === token;
}
