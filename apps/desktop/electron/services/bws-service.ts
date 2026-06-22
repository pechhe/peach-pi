import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type {
  BwsProject,
  BwsSecret,
  BwsSecretInput,
  BwsSecretPatch,
  BwsStatus,
} from "@peach-pi/shared-types";

import type { Emit } from "../ipc/registry.ts";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/** Where the on-device access token + selected project live. Kept out of the
 *  repo and the renderer; the token is injected into `bws` via env. */
const CONFIG_FILE = path.join(homedir(), ".pi", "agent", "peach-bws.json");

/** Preferred install location (also where a manually-installed bws often sits
 *  in this setup). GUI apps don't inherit the login-shell PATH, so we probe
 *  common dirs explicitly before falling back to a bare `bws` PATH lookup. */
const INSTALL_DIR = path.join(homedir(), ".pi", "agent", "bin");
const INSTALL_PATH = path.join(INSTALL_DIR, "bws");

interface BwsConfig {
  accessToken?: string;
  projectId?: string | null;
}

/** GUI apps launch without the login-shell environment, so a token the user
 *  exported in ~/.zshrc (etc.) isn't visible via process.env. Spawn their login
 *  shell once to read BWS_ACCESS_TOKEN, fenced with sentinels so rc-file noise
 *  doesn't pollute the value. Cached for the process lifetime. */
let shellTokenCache: string | null | undefined;
async function detectShellToken(): Promise<string | null> {
  if (shellTokenCache !== undefined) return shellTokenCache;
  if (process.env.BWS_ACCESS_TOKEN?.trim()) {
    shellTokenCache = process.env.BWS_ACCESS_TOKEN.trim();
    return shellTokenCache;
  }
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(
      shell,
      ["-lic", `printf 'BWST[%s]BWST' "$BWS_ACCESS_TOKEN"`],
      { timeout: 8_000, maxBuffer: 1024 * 1024 },
    );
    const m = stdout.match(/BWST\[([\s\S]*?)\]BWST/);
    const token = m?.[1]?.trim() ?? "";
    shellTokenCache = token || null;
  } catch {
    shellTokenCache = null;
  }
  return shellTokenCache;
}

function readConfig(): BwsConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as BwsConfig;
  } catch {
    return {};
  }
}

function writeConfig(cfg: BwsConfig): void {
  mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/** Locate the `bws` binary. Returns null if not found anywhere. */
function findBwsBin(): string | null {
  const candidates = [
    INSTALL_PATH,
    "/opt/homebrew/bin/bws",
    "/usr/local/bin/bws",
    path.join(homedir(), ".cargo", "bin", "bws"),
    path.join(homedir(), ".local", "bin", "bws"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

/** One Secrets Manager object as returned by `bws … -o json`. */
interface RawSecret {
  id: string;
  organizationId: string;
  projectId: string;
  key: string;
  value: string;
  note: string;
  creationDate: string;
  revisionDate: string;
}
interface RawProject {
  id: string;
  organizationId: string;
  name: string;
}

/**
 * Thin wrapper over the `bws` CLI. The main process holds the access token and
 * passes it to every invocation via `BWS_ACCESS_TOKEN`, so it never reaches the
 * renderer or appears in the process argument list. Secret *values* do cross
 * IPC — the BWS view displays and edits them.
 */
export class BwsService {
  constructor(private emit: Emit) {}

  // ── auth + project + status ────────────────────────────────────────────────

  async status(): Promise<BwsStatus> {
    const bin = findBwsBin();
    const installed = bin !== null;
    let version: string | null = null;
    if (bin) {
      try {
        const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 10_000 });
        version = stdout.trim().replace(/^bws\s+/i, "");
      } catch {
        version = null;
      }
    }

    const cfg = readConfig();
    const shellToken = await detectShellToken();
    const tokenSource: BwsStatus["tokenSource"] = cfg.accessToken
      ? "saved"
      : shellToken
        ? "shell"
        : null;
    const hasToken = tokenSource !== null;
    let authenticated = false;
    let projects: BwsProject[] = [];
    let error: string | null = null;

    if (installed && hasToken) {
      try {
        projects = await this.listProjects();
        authenticated = true;
      } catch (e) {
        error = errMessage(e);
      }
    }

    const projectId = cfg.projectId ?? null;
    const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;

    return {
      installed,
      version,
      hasToken,
      tokenSource,
      authenticated,
      projectId,
      project,
      projects,
      error,
    };
  }

  async setAccessToken(token: string): Promise<BwsStatus> {
    const cfg = readConfig();
    const trimmed = token.trim();
    if (trimmed) cfg.accessToken = trimmed;
    else delete cfg.accessToken;
    writeConfig(cfg);
    this.emit("event:bwsChanged", undefined);
    return this.status();
  }

  async clearAuth(): Promise<BwsStatus> {
    const cfg = readConfig();
    delete cfg.accessToken;
    writeConfig(cfg);
    this.emit("event:bwsChanged", undefined);
    return this.status();
  }

  async setProject(projectId: string | null): Promise<BwsStatus> {
    const cfg = readConfig();
    cfg.projectId = projectId;
    writeConfig(cfg);
    this.emit("event:bwsChanged", undefined);
    return this.status();
  }

  // ── projects + secrets ──────────────────────────────────────────────────────

  async listProjects(): Promise<BwsProject[]> {
    const raw = await this.runJson<RawProject[]>(["project", "list"]);
    return (raw ?? []).map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
    }));
  }

  async listSecrets(projectId?: string | null): Promise<BwsSecret[]> {
    const args = ["secret", "list"];
    if (projectId) args.push(projectId);
    const raw = await this.runJson<RawSecret[]>(args);
    return (raw ?? []).map(toSecret);
  }

  async createSecret(input: BwsSecretInput): Promise<BwsSecret> {
    const args = ["secret", "create", input.key, input.value, input.projectId];
    if (input.note) args.push("--note", input.note);
    const raw = await this.runJson<RawSecret>(args);
    this.emit("event:bwsChanged", undefined);
    return toSecret(raw);
  }

  async editSecret(secretId: string, patch: BwsSecretPatch): Promise<BwsSecret> {
    const args = ["secret", "edit", secretId];
    if (patch.key !== undefined) args.push("--key", patch.key);
    if (patch.value !== undefined) args.push("--value", patch.value);
    if (patch.note !== undefined) args.push("--note", patch.note);
    if (patch.projectId !== undefined) args.push("--project-id", patch.projectId);
    const raw = await this.runJson<RawSecret>(args);
    this.emit("event:bwsChanged", undefined);
    return toSecret(raw);
  }

  async deleteSecret(secretId: string): Promise<void> {
    await this.run(["secret", "delete", secretId]);
    this.emit("event:bwsChanged", undefined);
  }

  // ── install ──────────────────────────────────────────────────────────────────

  /** Download the latest `bws` release for this Mac and drop it in INSTALL_DIR.
   *  macOS only (the app's target platform); uses the system `unzip`. */
  async install(): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "darwin") {
      return { ok: false, error: "Automatic install is only supported on macOS." };
    }
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    try {
      const res = await fetch(
        "https://api.github.com/repos/bitwarden/sdk-sm/releases?per_page=30",
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const releases = (await res.json()) as { tag_name: string }[];
      const rel = releases.find((r) => r.tag_name.startsWith("bws-v"));
      if (!rel) throw new Error("No bws release found.");
      const version = rel.tag_name.replace(/^bws-v/, "");
      const asset = `bws-${arch}-apple-darwin-${version}.zip`;
      const url = `https://github.com/bitwarden/sdk-sm/releases/download/${rel.tag_name}/${asset}`;

      const zipRes = await fetch(url);
      if (!zipRes.ok) throw new Error(`Download failed (${zipRes.status})`);
      const buf = Buffer.from(await zipRes.arrayBuffer());

      const work = path.join(tmpdir(), `bws-install-${Date.now()}`);
      mkdirSync(work, { recursive: true });
      const zipPath = path.join(work, asset);
      writeFileSync(zipPath, buf);
      await execFileAsync("unzip", ["-o", zipPath, "-d", work], { timeout: TIMEOUT_MS });

      const extracted = path.join(work, "bws");
      if (!existsSync(extracted)) throw new Error("Archive did not contain a bws binary.");
      mkdirSync(INSTALL_DIR, { recursive: true });
      if (existsSync(INSTALL_PATH)) rmSync(INSTALL_PATH);
      renameSync(extracted, INSTALL_PATH);
      chmodSync(INSTALL_PATH, 0o755);
      rmSync(work, { recursive: true, force: true });

      this.emit("event:bwsChanged", undefined);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMessage(e) };
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Run `bws` with the access token injected via env. Returns stdout. */
  private async run(args: string[]): Promise<string> {
    const bin = findBwsBin();
    if (!bin) throw new Error("bws is not installed.");
    const cfg = readConfig();
    const token = cfg.accessToken ?? (await detectShellToken());
    if (!token) throw new Error("No access token. Authenticate first.");
    const env = { ...process.env, BWS_ACCESS_TOKEN: token };
    try {
      const { stdout } = await execFileAsync(bin, [...args, "--color", "no"], {
        env,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      return stdout;
    } catch (e) {
      throw new Error(errMessage(e));
    }
  }

  /** Run a command that emits JSON and parse it. */
  private async runJson<T>(args: string[]): Promise<T> {
    const out = await this.run([...args, "--output", "json"]);
    return JSON.parse(out) as T;
  }
}

function toSecret(r: RawSecret): BwsSecret {
  return {
    id: r.id,
    organizationId: r.organizationId,
    projectId: r.projectId,
    key: r.key,
    value: r.value,
    note: r.note ?? "",
    creationDate: r.creationDate,
    revisionDate: r.revisionDate,
  };
}

/** Surface the most useful message from an execFile/CLI error (stderr first). */
function errMessage(e: unknown): string {
  const stderr = (e as { stderr?: string }).stderr;
  if (stderr && stderr.trim()) return stderr.trim().slice(-2000);
  return e instanceof Error ? e.message : String(e);
}
