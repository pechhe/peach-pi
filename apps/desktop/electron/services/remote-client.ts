import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest, Agent as HttpAgent } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { promisify } from "node:util";
import type {
  RemoteHostConnection,
  RemotePullResult,
  RemoteSessionInfo,
  RemoteTapFrame,
  ThreadId,
} from "@peach-pi/shared-types";
import type { Emit } from "../ipc/registry.ts";
import type { RemoteHostService } from "./remote-host.ts";
import { checkpointBranch } from "./remote-checkpoint.ts";

const execFileAsync = promisify(execFile);

const CONNECTIONS_PATH = join(homedir(), ".pi", "agent", "peach-remote-hosts.json");

/** Base origin for a saved connection. A full URL (Tailscale Serve HTTPS, no
 *  port) is used as-is; a bare host falls back to plain HTTP on its port. */
function baseUrl(c: { host: string; port: number }): string {
  const host = c.host.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(host)) return host;
  return `http://${host}:${c.port}`;
}

/** Pick the http/https request fn + Agent for a URL's protocol so the same
 *  client can reach a bare tailnet host (HTTP) or a Serve endpoint (HTTPS). */
function transportFor(url: URL): {
  request: typeof httpRequest;
  Agent: typeof HttpAgent;
} {
  return url.protocol === "https:"
    ? { request: httpsRequest as typeof httpRequest, Agent: HttpsAgent as typeof HttpAgent }
    : { request: httpRequest, Agent: HttpAgent };
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * Laptop-side client (ADR-0009). Attaches read-only to a master's session tap
 * (SSE), forwarding frames to the renderer via `event:remoteTap`, and pulls a
 * checkpoint branch into an isolated worktree for testing. v1 is observe-only:
 *  no steer-back channel.
 */
export class RemoteClientService {
  /** hostId → active tap controller (cancel the request to detach). */
  private active = new Map<string, { hostId: string; threadId: ThreadId; agent: HttpAgent; abort: AbortController }>();
  private connections: RemoteHostConnection[] = [];

  constructor(
    private emit: Emit,
    /** Resolve the project dir that owns a repo matching an origin URL. */
    private projectForOrigin: (originUrl: string) => Promise<string | null>,
    /** worktrees root for checkouts. */
    private worktreesDir: string,
  ) {}

  async load(): Promise<void> {
    try {
      this.connections =
        (JSON.parse(await readFile(CONNECTIONS_PATH, "utf8")) as RemoteHostConnection[]) ?? [];
    } catch {
      this.connections = [];
    }
  }

  async persist(): Promise<void> {
    await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
    await writeFile(CONNECTIONS_PATH, JSON.stringify(this.connections, null, 2), "utf8");
  }

  listHosts(): RemoteHostConnection[] {
    return [...this.connections];
  }

  async addHost(input: {
    name: string;
    host: string;
    port: number;
    token: string;
  }): Promise<RemoteHostConnection> {
    const conn: RemoteHostConnection = { id: randomUUID(), ...input };
    this.connections.push(conn);
    await this.persist();
    return conn;
  }

  async removeHost(hostId: string): Promise<void> {
    this.connections = this.connections.filter((c) => c.id !== hostId);
    await this.persist();
  }

  private conn(hostId: string): RemoteHostConnection {
    const c = this.connections.find((x) => x.id === hostId);
    if (!c) throw new Error(`Unknown host: ${hostId}`);
    return c;
  }

  /** Fetch the served-session list from a master. */
  async listSessions(hostId: string): Promise<RemoteSessionInfo[]> {
    const c = this.conn(hostId);
    return this.getJson<RemoteSessionInfo[]>(c, "/sessions");
  }

  /** GET a JSON body from a master (used by listSessions + pullToTest). */
  private getJson<T>(c: RemoteHostConnection, pathName: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const url = new URL(pathName, baseUrl(c));
      const { request } = transportFor(url);
      const req = request(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${c.token}`, Accept: "application/json" },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d: Buffer) => chunks.push(d));
        res.on("end", () => {
          if (res.statusCode !== 200)
            return reject(new Error(`master returned ${res.statusCode}`));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  /** Open the SSE tap and stream frames to the renderer. */
  attach(hostId: string, threadId: ThreadId): void {
    this.detach();
    const c = this.conn(hostId);
    const controller = new AbortController();
    const url = new URL(`/tap?threadId=${encodeURIComponent(threadId)}`, baseUrl(c));
    const { request, Agent } = transportFor(url);
    const agent = new Agent({ keepAlive: true });
    const key = `${hostId}:${threadId}`;
    this.active.set(key, { hostId, threadId, agent, abort: controller });

    const req = request(
      url,
      {
        method: "GET",
        agent,
        headers: { Authorization: `Bearer ${c.token}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
      (res) => {
        if (res.statusCode !== 200) {
          this.emit("event:remoteTap", {
            kind: "bye",
            threadId,
            reason: `master returned ${res.statusCode}`,
          });
          return;
        }
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = block
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const frame = JSON.parse(dataLine.slice(5).trim()) as RemoteTapFrame;
              this.emit("event:remoteTap", frame);
            } catch {
              // Ignore malformed lines (comments/heartbeats).
            }
          }
        });
        res.on("close", () => {
          this.emit("event:remoteTap", { kind: "bye", threadId, reason: "connection closed" });
          this.active.delete(key);
        });
      },
    );
    req.on("error", (err) => {
      this.emit("event:remoteTap", { kind: "bye", threadId, reason: String(err.message ?? err) });
      this.active.delete(key);
    });
    req.end();
  }

  detach(): void {
    for (const [, a] of this.active) {
      a.abort.abort();
      a.agent.destroy();
    }
    this.active.clear();
  }

  /**
   * Pull a checkpoint branch into an isolated worktree. Matches the session's
   * origin URL to a local project, fetches `wip/<threadId>` from origin, and
   * checks it out detached into a fresh worktree under the worktrees dir.
   */
  async pullToTest(hostId: string, threadId: ThreadId): Promise<RemotePullResult> {
    const sessions = await this.listSessions(hostId);
    const info = sessions.find((s) => s.threadId === threadId);
    if (!info?.originUrl) throw new Error("session has no origin URL to match a local project");
    const projectDir = await this.projectForOrigin(info.originUrl);
    if (!projectDir)
      throw new Error(`no local project matches ${info.originUrl}; add it first`);

    const branch = checkpointBranch(threadId);
    // Fetch the checkpoint branch (with a local ref namespace so it never
    // collides with or is checked out onto the project's working tree).
    await git(
      [
        "fetch",
        "origin",
        `${branch}:refs/remotes/origin/${branch}`,
      ],
      projectDir,
    ).catch(() => {
      /* branch may not exist on origin yet — fall through to tip below */
    });
    const sha = (
      await git(["rev-parse", "--verify", `refs/remotes/origin/${branch}`], projectDir)
    )
      .trim()
      .replace(/^refs\/.+\//, "");
    if (!sha || !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("checkpoint branch not found on origin");

    const dir = join(this.worktreesDir, `${threadId}-${Date.now()}`);
    // Detached worktree on the checkpoint sha — never touches the project's HEAD.
    await git(["worktree", "add", "--detach", dir, sha], projectDir);
    return { worktreePath: dir, sha };
  }
}
