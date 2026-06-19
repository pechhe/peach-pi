import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { SubagentAgentInfo, SubagentAgentPatch } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo } from "../persistence/repositories.ts";

/**
 * Makes the pi-subagents extension work inside the GUI.
 *
 * The extension spawns child pi processes. Inside Electron its fallbacks are
 * useless (process.execPath is Electron, argv[1] isn't a pi entry), so we
 * point PI_SUBAGENT_PI_COMMAND at a wrapper script that runs the bundled SDK
 * CLI via Electron-as-Node. Children inherit our process.env (the extension
 * spreads it), so this is the only env var we need to set.
 *
 * The extension parses PI_SUBAGENT_PI_COMMAND as a shell-style command string
 * (word-split, quote-aware), so the wrapper path MUST be shell-quoted: on
 * macOS it lives under "~/Library/Application Support/<App Name>/", which
 * always contains spaces.
 */
export function setupSubagentEnvironment(userDataDir: string): void {
  if (process.env.PI_SUBAGENT_PI_COMMAND) return; // user override wins
  try {
    // The SDK is ESM-only; require.resolve can't see inside its exports map
    // from our CJS bundle. Walk node_modules upward instead (dev: workspace
    // root; packaged: app.asar/node_modules).
    const cli = findUp(__dirname, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
    if (!cli) return;
    mkdirSync(userDataDir, { recursive: true });
    const wrapper = path.join(userDataDir, "pi-wrapper.sh");
    writeFileSync(
      wrapper,
      `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${process.execPath}" "${cli}" "$@"\n`,
    );
    chmodSync(wrapper, 0o755);
    process.env.PI_SUBAGENT_PI_COMMAND = shellQuote(wrapper);
  } catch (err) {
    console.error("subagent env setup failed:", err);
  }
}

/**
 * POSIX single-quote escaping. Matches the pi-subagents extension's own
 * shellEscape, so the value round-trips through both /bin/sh and the
 * extension's parseCommandWords.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function findUp(fromDir: string, relPath: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, relPath);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Writes a patch back to an agent file's YAML frontmatter, preserving body + other keys. */
function writeAgentPatch(filePath: string, patch: SubagentAgentPatch, scope: "global" | "project"): SubagentAgentInfo {
  const raw = readFileSync(filePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`agent file has no frontmatter: ${filePath}`);
  const lines = match[1]!.split("\n");
  const body = match[2]!;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line.trim());
    if (!kv) {
      out.push(line);
      continue;
    }
    const key = kv[1]!.toLowerCase();
    seen.add(key);
    if (key === "model") {
      if (patch.model !== undefined) {
        if (patch.model) out.push(`model: ${patch.model}`);
      } else out.push(line);
    } else if (key === "thinking") {
      if (patch.thinking !== undefined) {
        if (patch.thinking) out.push(`thinking: ${patch.thinking}`);
      } else out.push(line);
    } else {
      out.push(line);
    }
  }
  // Keys absent from file but provided in patch get appended (preserving file order).
  if (patch.model && !seen.has("model")) out.push(`model: ${patch.model}`);
  if (patch.thinking && !seen.has("thinking")) out.push(`thinking: ${patch.thinking}`);
  const nextRaw = `---\n${out.join("\n")}\n---\n${body}`;
  writeFileSync(filePath, nextRaw);
  const reparsed = parseAgentFile(filePath, scope);
  if (!reparsed) throw new Error(`failed to reparse agent file after patch: ${filePath}`);
  return reparsed;
}

/** Minimal YAML-frontmatter parse — same fields peche-pi's roster shows. */
function parseAgentFile(filePath: string, scope: "global" | "project"): SubagentAgentInfo | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    const front: Record<string, string> = {};
    if (match) {
      for (const line of match[1]!.split("\n")) {
        const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line.trim());
        if (kv) front[kv[1]!.toLowerCase()] = kv[2]!.replace(/^["']|["']$/g, "");
      }
    }
    return {
      name: front.name || path.basename(filePath, ".md"),
      description: front.description || undefined,
      model: front.model || undefined,
      thinking: front.thinking || undefined,
      mode: front.mode || undefined,
      enabled: front.enabled !== "false",
      scope,
      filePath,
      body: (match ? match[2]! : raw).trim(),
    };
  } catch {
    return null;
  }
}

function agentsIn(dir: string, scope: "global" | "project"): SubagentAgentInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseAgentFile(path.join(dir, f), scope))
    .filter((a): a is SubagentAgentInfo => a !== null);
}

export class SubagentService {
  private projects: ProjectRepo;

  constructor(db: AppDb) {
    this.projects = new ProjectRepo(db);
  }

  /** Global roster + project roster (project agents shadow globals by name). */
  listAgents(projectId: string | null): SubagentAgentInfo[] {
    const globalAgents = agentsIn(path.join(homedir(), ".pi", "agent", "agents"), "global");
    const project = projectId ? this.projects.all().find((p) => p.id === projectId) : null;
    const projectAgents = project ? agentsIn(path.join(project.path, ".pi", "agents"), "project") : [];
    const names = new Set(projectAgents.map((a) => a.name));
    return [...projectAgents, ...globalAgents.filter((a) => !names.has(a.name))];
  }

  /** Apply a model/thinking patch to an agent file and return the updated info. */
  updateAgent(filePath: string, patch: SubagentAgentPatch): SubagentAgentInfo {
    if (!existsSync(filePath)) throw new Error(`agent file not found: ${filePath}`);
    const scope: "global" | "project" = filePath.startsWith(path.join(homedir(), ".pi", "agent", "agents"))
      ? "global"
      : "project";
    return writeAgentPatch(filePath, patch, scope);
  }
}
