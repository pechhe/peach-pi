// Fallow codebase-intelligence bridge.
//
// Detects whether `fallow` is installed in a project, installs it via the
// detected package manager, and runs `fallow dead-code --format json` to
// surface a bounded summary to the UI + thread prompts.
//
// Install/run happen on explicit user action only — never on boot, never
// periodically. No production behavior change unless the user opts in.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type {
  FallowProjectStatus,
  FallowReport,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo } from "../persistence/repositories.ts";

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

const LOCKFILES: Record<PackageManager, string> = {
  pnpm: "pnpm-lock.yaml",
  npm: "package-lock.json",
  yarn: "yarn.lock",
  bun: "bun.lockb",
};

/** Max bytes of fallow JSON retained in a report (bounded for IPC + prompts). */
const MAX_JSON_BYTES = 256 * 1024;

export class FallowService {
  private projects: ProjectRepo;

  constructor(db: AppDb) {
    this.projects = new ProjectRepo(db);
  }

  private projectPath(projectId: string): string {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    return project.path;
  }

  /** Detect the package manager from the lockfile at the project root. */
  private async detectPackageManager(root: string): Promise<PackageManager | null> {
    for (const [pm, lock] of Object.entries(LOCKFILES) as [PackageManager, string][]) {
      if (existsSync(join(root, lock))) return pm;
    }
    return null;
  }

  /** Locate the fallow binary inside the project's node_modules. */
  private binPath(root: string): string | null {
    const p = join(root, "node_modules", ".bin", "fallow");
    return existsSync(p) ? p : null;
  }

  /** Resolve fallow version via `<bin> --version` (returns null on failure). */
  private async version(bin: string): Promise<string | null> {
    try {
      const out = await runCmd(bin, ["--version"], process.cwd());
      // fallow prints "fallow <ver> ..." — take the first numeric token.
      const m = out.match(/fallow\s+(\S+)/i);
      return m ? m[1] ?? null : out.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }

  /** Cheap detection: bin present + version readable. No execution of scans. */
  async status(projectId: string): Promise<FallowProjectStatus> {
    const root = this.projectPath(projectId);
    const pm = await this.detectPackageManager(root);
    const bin = this.binPath(root);
    const version = bin ? await this.version(bin) : null;
    return {
      installed: bin !== null && version !== null,
      binPath: bin,
      version,
      packageManager: pm,
    };
  }

  /** Install `fallow` as a devDep via the detected package manager. */
  async install(projectId: string): Promise<FallowProjectStatus> {
    const root = this.projectPath(projectId);
    let pm = await this.detectPackageManager(root);
    // Fall back to pnpm (the app's own manager) if nothing's declared.
    if (!pm) pm = "pnpm";
    const cmd = installCmd(pm);
    await runCmd(cmd.bin, cmd.args, root);
    return this.status(projectId);
  }

  /** Run `fallow dead-code --format json` and return a bounded summary. */
  async run(projectId: string): Promise<FallowReport> {
    const root = this.projectPath(projectId);
    const st = await this.status(projectId);
    if (!st.installed || !st.binPath) {
      return {
        ok: false,
        error: "Fallow is not installed in this project.",
        ranAt: new Date().toISOString(),
        counts: emptyCounts(),
        json: null,
      };
    }
    let out: string;
    try {
      out = await runCmd(st.binPath, ["dead-code", "--format", "json"], root);
    } catch (err) {
      return {
        ok: false,
        error: String(err),
        ranAt: new Date().toISOString(),
        counts: emptyCounts(),
        json: null,
      };
    }
    const json = out.length > MAX_JSON_BYTES ? out.slice(0, MAX_JSON_BYTES) : out;
    return {
      ok: true,
      error: null,
      ranAt: new Date().toISOString(),
      counts: parseCounts(out),
      json,
    };
  }
}

function emptyCounts(): FallowReport["counts"] {
  return {
    unusedFiles: 0,
    unusedExports: 0,
    unusedTypes: 0,
    unusedClassMembers: 0,
    unusedDependencies: 0,
    unlistedDependencies: 0,
    duplicateExports: 0,
    unusedComponentProps: 0,
  };
}

function installCmd(pm: PackageManager): { bin: string; args: string[] } {
  switch (pm) {
    case "pnpm":
      return { bin: "pnpm", args: ["add", "-Dw", "fallow"] };
    case "npm":
      return { bin: "npm", args: ["install", "-D", "fallow"] };
    case "yarn":
      return { bin: "yarn", args: ["add", "-D", "fallow"] };
    case "bun":
      return { bin: "bun", args: ["add", "-d", "fallow"] };
  }
}

/** Run a command and capture stdout. Rejects on non-zero exit. */
function runCmd(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

/**
 * Parse fallow's `dead-code --format json` output for aggregate counts.
 * Defensive: fallow's JSON shape may vary by version — we surface everything
 * we can find and zero the rest, so a parse failure never breaks the UI.
 */
function parseCounts(stdout: string): FallowReport["counts"] {
  const counts = emptyCounts();
  // fallow emits a WARN log block before the JSON; extract the JSON blob.
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return counts;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return counts;
  }
  // Shape: { summary: { unused_files, unused_exports, unused_types,
  //   unused_class_members, unused_dependencies, unlisted_dependencies,
  //   duplicate_exports, unused_component_props, ... }, ... }.
  const obj = parsed as Record<string, unknown>;
  const summary = (obj.summary ?? obj) as Record<string, unknown>;
  const num = (k: string): number => {
    const v = summary[k];
    return typeof v === "number" ? v : 0;
  };
  counts.unusedFiles = num("unused_files");
  counts.unusedExports = num("unused_exports");
  counts.unusedTypes = num("unused_types");
  counts.unusedClassMembers = num("unused_class_members");
  counts.unusedDependencies = num("unused_dependencies");
  counts.unlistedDependencies = num("unlisted_dependencies");
  counts.duplicateExports = num("duplicate_exports");
  counts.unusedComponentProps = num("unused_component_props");
  return counts;
}
