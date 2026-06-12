import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import type { GraphifyStatus } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo } from "../persistence/repositories.ts";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 10 * 60 * 1000; // matches peche-pi's 10-min build timeout

/** GUI apps don't inherit the login-shell PATH — probe common install dirs. */
function findGraphifyBin(): string | null {
  const candidates = [
    path.join(homedir(), ".local", "bin", "graphify"),
    "/opt/homebrew/bin/graphify",
    "/usr/local/bin/graphify",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null; // fall back to PATH lookup at exec time
}

export class GraphifyService {
  private projects: ProjectRepo;
  private running = new Set<string>();

  constructor(db: AppDb) {
    this.projects = new ProjectRepo(db);
  }

  private projectPath(projectId: string): string {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    return project.path;
  }

  status(projectId: string): GraphifyStatus {
    const root = this.projectPath(projectId);
    const graphJson = path.join(root, "graphify-out", "graph.json");
    const base: GraphifyStatus = {
      available: findGraphifyBin() !== null,
      hasGraph: false,
      nodeCount: 0,
      edgeCount: 0,
      builtAt: null,
      building: this.running.has(projectId),
    };
    if (!existsSync(graphJson)) return base;
    try {
      const graph = JSON.parse(readFileSync(graphJson, "utf8")) as {
        nodes?: unknown[];
        edges?: unknown[];
        links?: unknown[];
      };
      return {
        ...base,
        hasGraph: true,
        nodeCount: graph.nodes?.length ?? 0,
        edgeCount: (graph.edges ?? graph.links)?.length ?? 0,
        builtAt: statSync(graphJson).mtime.toISOString(),
      };
    } catch {
      return { ...base, hasGraph: true };
    }
  }

  /** Full build: extract → cluster-only (peche-pi's sequence). */
  async build(projectId: string): Promise<{ ok: boolean; error?: string }> {
    return this.run(projectId, [["extract", "."], ["cluster-only", "."]]);
  }

  async update(projectId: string): Promise<{ ok: boolean; error?: string }> {
    return this.run(projectId, [["update", "."]]);
  }

  private async run(
    projectId: string,
    commands: string[][],
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.running.has(projectId)) return { ok: false, error: "Already running" };
    const cwd = this.projectPath(projectId);
    const bin = findGraphifyBin() ?? "graphify";
    this.running.add(projectId);
    try {
      for (const args of commands) {
        await execFileAsync(bin, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
      }
      return { ok: true };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      return { ok: false, error: stderr?.slice(-2000) || String(err) };
    } finally {
      this.running.delete(projectId);
    }
  }

  /** Standalone HTML viewer ships in graphify-out — open in default browser. */
  async openViewer(projectId: string): Promise<boolean> {
    const html = path.join(this.projectPath(projectId), "graphify-out", "graph.html");
    if (!existsSync(html)) return false;
    await shell.openPath(html);
    return true;
  }

  report(projectId: string): string | null {
    const file = path.join(this.projectPath(projectId), "graphify-out", "GRAPH_REPORT.md");
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }
}
