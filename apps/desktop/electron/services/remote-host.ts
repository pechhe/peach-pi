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
  ProjectId,
  RemoteHostConfig,
  RemoteSessionInfo,
  RemoteTapFrame,
  ThreadId,
  TranscriptDelta,
  TranscriptSnapshot,
} from "@peach-pi/shared-types";
import { resolveBindAddress, isValidToken, type IfaceAddress } from "./remote-tailnet.ts";
import { checkpointTip, originUrl } from "./remote-checkpoint.ts";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "peach-remote-host.json");

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
 * Surface:
 *   GET  /health                     → { ok: true }
 *   GET  /sessions                   → RemoteSessionInfo[]
 *   GET  /tap?threadId=&lastSeq=     → SSE stream of RemoteTapFrame
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
  }[];
  /** Working dir for a thread (to read checkpoint + origin). */
  threadCwd: (threadId: ThreadId) => string | null;
  /** Override interface lookup for tests. */
  interfaces?: () => Record<string, IfaceAddress[]>;
}

export class RemoteHostService {
  private server: Server | null = null;
  private port = 0;
  private bindIp: string | null = null;
  private token = randomBytes(24).toString("hex");
  private enabled = false;
  /** SSE listeners per thread: late-joiners get a backfill, all get the tail. */
  private listeners = new Map<ThreadId, Set<ServerResponse>>();
  /** "Serve all projects" shortcut — when true, current AND future projects
   *  are served; `servedProjects` is ignored. */
  private serveAll = false;
  /** Explicitly served project ids (only consulted when !serveAll). */
  private servedProjects = new Set<ProjectId>();

  private deps: RelayDeps;

  constructor(deps: RelayDeps) {
    this.deps = deps;
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

  /** Is a given thread currently served? A thread is served iff it belongs to a
   *  served project. Chats (projectId null) are never served in v1 (no repo,
   *  no checkpoint to pull). `serveAll` opts into every current + future project. */
  isServedThread(threadId: ThreadId): boolean {
    const t = this.deps.threads().find((x) => x.id === threadId);
    if (!t || !t.projectId) return false;
    return this.serveAll || this.servedProjects.has(t.projectId);
  }

  /** Toggle the "serve all projects" shortcut. Disabling it re-evaluates
   *  membership and kicks any listener whose thread is no longer served. */
  setServeAll(serveAll: boolean): void {
    this.serveAll = serveAll;
    this.kickUnservedListeners();
  }

  /** Add/remove a project from the served set. Kicks listeners on a
   *  just-un-served project's threads. */
  setProjectServed(projectId: ProjectId, served: boolean): void {
    if (served) this.servedProjects.add(projectId);
    else {
      this.servedProjects.delete(projectId);
      this.kickUnservedListeners();
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
    return this.status();
  }

  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    this.enabled = false;
    this.listeners.forEach((set) => set.forEach((res) => res.end()));
    this.listeners.clear();
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
      if (!this.checkAuth(req)) return this.send(res, 401, { error: "unauthorized" });
      const url = new URL(req.url ?? "/", `http://${this.bindIp ?? "127.0.0.1"}`);

      if (req.method === "GET" && url.pathname === "/health") {
        return this.send(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/sessions") {
        const sessions: RemoteSessionInfo[] = [];
        for (const t of this.deps.threads()) {
          if (t.archivedAt) continue;
          if (!this.isServedThread(t.id)) continue;
          const cwd = this.deps.threadCwd(t.id);
          const sha = cwd ? await checkpointTip(cwd, t.id) : null;
          sessions.push({
            threadId: t.id,
            title: t.title,
            status: t.status as RemoteSessionInfo["status"],
            originUrl: cwd ? await originUrl(cwd) : null,
            lastCheckpointSha: sha,
            lastCheckpointAt: null,
          });
        }
        return this.send(res, 200, sessions);
      }

      if (req.method === "GET" && url.pathname === "/tap") {
        return this.handleTap(req, res, url);
      }

      return this.send(res, 404, { error: "not found" });
    } catch (err) {
      return this.send(res, 500, { error: String(err) });
    }
  }

  /** SSE tap: backfill the transcript, then stream live frames. */
  private async handleTap(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const threadId = url.searchParams.get("threadId");
    if (!threadId) return this.send(res, 400, { error: "threadId required" });
    if (!this.isServedThread(threadId))
      return this.send(res, 404, { error: "thread's project is not served" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
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

    const set = this.listeners.get(threadId) ?? new Set<ServerResponse>();
    set.add(res);
    this.listeners.set(threadId, set);

    reqCloseHandler(_req, () => {
      set.delete(res);
      try {
        res.end();
      } catch {
        // already closed
      }
    });
  }

  private checkAuth(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? "";
    return isValidToken(this.token) && header === `Bearer ${this.token}`;
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
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
