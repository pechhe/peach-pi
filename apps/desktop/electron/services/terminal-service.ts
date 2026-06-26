import { chmodSync } from "node:fs";
import type { IPty } from "node-pty";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo, ThreadRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

/** Scrollback replayed when a terminal pane re-attaches. */
const BUFFER_CAP = 200_000;

interface Term {
  pty: IPty;
  buffer: string;
}

/**
 * One PTY per thread, living in main so panes survive view switches.
 * node-pty is required lazily — native module, external to the vite bundle.
 */
export class TerminalService {
  private threads: ThreadRepo;
  private projects: ProjectRepo;
  private emit: Emit;
  private terms = new Map<string, Term>();

  constructor(db: AppDb, emit: Emit) {
    this.threads = new ThreadRepo(db);
    this.projects = new ProjectRepo(db);
    this.emit = emit;
  }

  async open(threadId: string): Promise<{ buffer: string }> {
    const existing = this.terms.get(threadId);
    if (existing) return { buffer: existing.buffer };

    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    // Prefer the thread's worktree checkout (where the agent's work actually
    // lands) over the project's main path — opening a terminal for an
    // issue-agent thread must land in its isolated worktree.
    const cwd = thread.worktreeDir
      ?? (thread.projectId
        ? this.projects.all().find((p) => p.id === thread.projectId)?.path
        : thread.chatWorkspaceDir);
    if (!cwd) throw new Error("No working directory for thread");

    const pty = await import("node-pty");
    fixSpawnHelperPermissions();
    const shell = process.env.SHELL || "/bin/zsh";
    const proc = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });

    const term: Term = { pty: proc, buffer: "" };
    this.terms.set(threadId, term);
    proc.onData((data) => {
      term.buffer = (term.buffer + data).slice(-BUFFER_CAP);
      this.emit("event:terminalData", { threadId, data });
    });
    proc.onExit(({ exitCode }) => {
      this.terms.delete(threadId);
      this.emit("event:terminalExit", { threadId, exitCode });
    });
    return { buffer: "" };
  }

  input(threadId: string, data: string): void {
    this.terms.get(threadId)?.pty.write(data);
  }

  /** Open the thread's terminal (if not already open) and send a command +
   *  newline. Used by the "Run dev server" button. */
  async runCommand(threadId: string, command: string): Promise<{ ran: boolean }> {
    await this.open(threadId);
    this.terms.get(threadId)?.pty.write(`${command}\r`);
    this.emit("event:terminalData", {
      threadId,
      data: `\r\x1b[33m$ ${command}\x1b[0m\r\n`,
    });
    return { ran: true };
  }

  resize(threadId: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.terms.get(threadId)?.pty.resize(cols, rows);
  }

  kill(threadId: string): void {
    this.terms.get(threadId)?.pty.kill();
    this.terms.delete(threadId);
  }

  dispose(): void {
    for (const { pty } of this.terms.values()) pty.kill();
    this.terms.clear();
  }
}

/** npm tarball ships spawn-helper without the exec bit — restore it once. */
function fixSpawnHelperPermissions(): void {
  try {
    const helper = require
      .resolve("node-pty/package.json")
      .replace(/package\.json$/, `prebuilds/${process.platform}-${process.arch}/spawn-helper`)
      .replace("app.asar", "app.asar.unpacked");
    chmodSync(helper, 0o755);
  } catch {
    // Prebuild layout absent (e.g. compiled from source) — nothing to fix.
  }
}
