import { execFile, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Executor daemon endpoint. One app-owned daemon binds this port and serves
 *  its MCP surface at `/mcp`; the Connections UI and every pi session share it. */
export const EXECUTOR_PORT = 4788;
export const EXECUTOR_MCP_URL = `http://localhost:${EXECUTOR_PORT}/mcp`;

/** macOS ships sqlite3; the migration runs rarely (once) so shelling out
 *  avoids depending on Electron's Node having a stable `node:sqlite`. */
const SQLITE = "/usr/bin/sqlite3";

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Executor data dir (honours `EXECUTOR_DATA_DIR`, else `~/.executor`). */
export function executorDataDir(): string {
  return resolve(process.env.EXECUTOR_DATA_DIR ?? join(homedir(), ".executor"));
}

/** Stable workspace scope passed to `executor daemon run --scope`. Executor
 *  derives the tenant that owns ALL connections from this path
 *  (`basename-sha256(path)[:8]`), so a cwd-derived scope silently orphans every
 *  connection whenever the cwd changes (dev vs packaged vs repo move). Pinning
 *  a fixed home-based dir makes the tenant identical everywhere, forever. */
export function executorScopePath(): string {
  return join(executorDataDir(), "peach-workspace");
}

/** Tenant id executor computes for a scope path: `basename-sha256(path)[:8]`,
 *  using the path string as-is (path.resolve semantics, NOT realpath — on macOS
 *  `/tmp` ≠ `/private/tmp`). Must match executor byte-for-byte. */
export function computeTenant(scopePath: string): string {
  const p = resolve(scopePath);
  const base = p.split("/").pop() || p;
  const hash = createHash("sha256").update(p).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

/** True if a TCP connection to `host:port` opens within `timeoutMs`. */
export function canConnect(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((res) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      res(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Reads the stable Executor bearer token from
 *  `<dataDir>/server-control/auth.json`. Stable across daemon restarts and
 *  independent of the tenant. */
export async function readExecutorToken(): Promise<string | null> {
  try {
    const raw = readFileSync(join(executorDataDir(), "server-control", "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

/** Newest live daemon-active record bound to EXECUTOR_PORT, or null. */
function activeDaemonRecord(dataDir: string): { pid?: number; scopeId?: string } | null {
  let files: string[] = [];
  try {
    files = readdirSync(dataDir)
      .filter((f) => f.startsWith("daemon-active-") && f.endsWith(".json"))
      .map((f) => join(dataDir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      const r = JSON.parse(readFileSync(file, "utf8")) as {
        port?: number;
        pid?: number;
        scopeId?: string;
      };
      if (r.port === EXECUTOR_PORT) return { pid: r.pid, scopeId: r.scopeId };
    } catch {
      /* skip unreadable record */
    }
  }
  return null;
}

async function sqlite(dbPath: string, sql: string): Promise<string> {
  const { stdout } = await run(SQLITE, [dbPath, sql], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function waitPortFree(): Promise<boolean> {
  for (let i = 0; i < 24; i++) {
    if (!(await canConnect("localhost", EXECUTOR_PORT))) return true;
    await delay(250);
  }
  return false;
}

/** Stop the running daemon (graceful `daemon stop`, then kill its pid as a
 *  fallback) and wait for the port to free. */
async function stopDaemon(binPath: string, dataDir: string): Promise<void> {
  try {
    await run(binPath, ["daemon", "stop"], { timeout: 8000 });
  } catch {
    /* fall through to kill */
  }
  if (await waitPortFree()) return;
  const pid = activeDaemonRecord(dataDir)?.pid;
  if (pid) {
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
  }
  await waitPortFree();
}

/** One-time tenant migration: move every tenant-scoped row from any prior
 *  (cwd-derived) tenant to the stable-scope `target` tenant. Idempotent — a
 *  no-op once connections already live under `target`. Backs up `data.db`
 *  first. Stops the daemon so the write is safe; the caller restarts it.
 *  Returns true if it actually migrated (daemon left stopped). */
async function migrateTenantIfNeeded(
  binPath: string,
  dataDir: string,
  target: string,
): Promise<boolean> {
  const dbPath = join(dataDir, "data.db");
  if (!existsSync(dbPath)) return false; // fresh install — nothing to migrate

  const tenants = (await sqlite(dbPath, "SELECT DISTINCT tenant FROM connection;"))
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tenants.length === 0) return false; // no connections yet

  // Only migrate well-formed prior tenants that differ from the target.
  const sources = tenants.filter((t) => t !== target && /^[A-Za-z0-9._-]+$/.test(t));
  if (sources.length === 0) return false; // already on the stable tenant

  await stopDaemon(binPath, dataDir);
  await sqlite(dbPath, `.backup '${dbPath}.pre-migration-${Date.now()}'`);

  const tables = (
    await sqlite(
      dbPath,
      "SELECT m.name FROM sqlite_master m JOIN pragma_table_info(m.name) p " +
        "WHERE m.type='table' AND p.name='tenant';",
    )
  )
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const stmts = ["BEGIN;"];
  for (const t of tables) {
    for (const src of sources) {
      stmts.push(`UPDATE "${t}" SET tenant='${target}' WHERE tenant='${src}';`);
    }
  }
  stmts.push("COMMIT;");
  await sqlite(dbPath, stmts.join("\n"));
  return true;
}

/** Ensure the one app-owned Executor daemon is running, pinned to the stable
 *  scope, with all connections migrated onto that scope's tenant.
 *
 *  Steps: (1) run the one-time tenant migration; (2) reuse a running daemon
 *  only if it's pinned to our stable scope (a wrong-scope daemon serves an
 *  empty tenant — the class of bug that hides all connections); (3) otherwise
 *  spawn `executor daemon run --scope <stable>` detached and wait for it.
 *
 *  Never pass a different `--scope` here: the scope path IS the tenant key, so
 *  changing it orphans every connection (see `executorScopePath`). */
export async function ensureExecutorDaemon(binPath: string): Promise<void> {
  const dataDir = executorDataDir();
  const scope = executorScopePath();
  mkdirSync(scope, { recursive: true });
  const expectedScopeId = `scope:${scope}`;

  await migrateTenantIfNeeded(binPath, dataDir, computeTenant(scope));

  if (await canConnect("localhost", EXECUTOR_PORT)) {
    if (activeDaemonRecord(dataDir)?.scopeId === expectedScopeId) return;
    await stopDaemon(binPath, dataDir); // wrong scope — replace it
  }

  const child = spawn(
    binPath,
    [
      "daemon",
      "run",
      "--port",
      String(EXECUTOR_PORT),
      "--hostname",
      "localhost",
      "--scope",
      scope,
      "--foreground",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  for (let i = 0; i < 40; i++) {
    if (await canConnect("localhost", EXECUTOR_PORT)) return;
    await delay(250);
  }
}
