#!/usr/bin/env -S node --experimental-strip-types
/**
 * peach — movable execution CLI.
 *
 * Each thread has exactly one owner machine at a time. This CLI is the user
 * surface for `@peach-pi/remote-handoff`; the heavy lifting is in
 * `HandoffService`. `peach daemon <sub>` is the internal RPC the SSH
 * transport calls on a peer — users normally never type it.
 *
 * Usage examples:
 *
 *   peach threads
 *   peach remote start "work on auth flow" --machine home
 *   peach take thread_abc123
 *   peach send thread_abc123 --machine home
 *   peach sync
 *   peach status thread_abc123
 *   peach logs thread_abc123
 *
 * See docs/remote-handoff.md for the movable-execution model.
 */
import { SshTransport } from "../src/transport.ts";
import { HandoffService } from "../src/handoff.ts";
import type { ThreadStatus } from "../src/types.ts";

function usage(): string {
  return `peach — movable execution (per-thread ownership with safe handoff)

A thread is owned by exactly one machine at a time. Only the owner may mutate
the thread's workspace. Takeover/send transfer that ownership, checkpointing
dirty work into git first.

Commands:
  threads                                   List known threads (id, branch, owner, status)
  remote start <task> [--machine <name>]    Create a thread and start it on a (remote) machine
  take <thread_id> [--force]                Take ownership to this machine
  send <thread_id> [--machine <name>]       Hand ownership back to a remote machine
  sync [--read-only]                        Fetch thread branches; update owned worktrees only
  status <thread_id>                        Show owner, lease, git, and process status
  logs <thread_id> [--lines N]              Print the owner's log (local read or polled remote)
  machine add <name> --ssh-host <host>       Register a peer machine
  machine list                              List registered machines
  daemon <sub> <args...>                    Internal RPC run on a peer over SSH

Environment:
  PEACH_MACHINE   this machine's name (default: local)
  PEACH_REPO      shared repo path (default: current git repo)
  PEACH_COMMAND   worker command (default: a logging stub; e.g. "pi chat")
  PEACH_ROOT      state root (default: ~/.peach)
`;
}

function die(msg: string): never {
  process.stderr.write(`peach: ${msg}\n`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help" || args[0] === "help") {
    process.stdout.write(usage());
    return;
  }
  const [cmd, ...rest] = args;

  const root = process.env.PEACH_ROOT;
  const transport = new SshTransport();
  const service = new HandoffService({
    root,
    repoPath: process.env.PEACH_REPO ?? null,
    machineName: process.env.PEACH_MACHINE ?? null,
    command: process.env.PEACH_COMMAND ?? null,
    transport,
  });

  switch (cmd) {
    case "threads": {
      const threads = await service.listThreads();
      printThreads(threads);
      return;
    }
    case "remote": {
      // `peach remote start "<task>"`
      const sub = rest[0];
      if (sub !== "start") die(`unknown 'peach remote' subcommand: ${sub ?? "(none)"}`);
      const parsed = parseFlags(rest.slice(1), ["--machine"]);
      const task = parsed.positional.join(" ").trim();
      if (!task) die("remote start needs a task description, e.g. peach remote start \"auth flow\"");
      const res = await service.remoteStart(task, { machine: parsed.flags["--machine"] });
      process.stdout.write(`created thread ${res.thread.id} → ${res.thread.branch}\n`);
      process.stdout.write(`  owner: ${res.thread.activeMachine}   status: ${res.thread.status}\n`);
      if (res.warning) process.stdout.write(`  ⚠ ${res.warning}\n`);
      if (res.thread.workspacePath) process.stdout.write(`  workspace: ${res.thread.workspacePath}\n`);
      return;
    }
    case "take": {
      const parsed = parseFlags(rest, ["--force"]);
      const id = parsed.positional[0];
      if (!id) die("take needs <thread_id>");
      const res = await service.take(id, { force: parsed.flags["--force"] === "true" });
      if (!res.ok) die(res.error ?? "take failed");
      process.stdout.write(`took ${res.threadId} → this machine\n`);
      if (res.workspacePath) process.stdout.write(`  workspace: ${res.workspacePath}\n`);
      if (res.recoveryBranch) process.stdout.write(`  ⚠ recovery branch: ${res.recoveryBranch}\n`);
      if (res.warning) process.stdout.write(`  ⚠ ${res.warning}\n`);
      return;
    }
    case "send": {
      const parsed = parseFlags(rest, ["--machine"]);
      const id = parsed.positional[0];
      if (!id) die("send needs <thread_id>");
      const res = await service.send(id, { machine: parsed.flags["--machine"] });
      if (!res.ok) die(res.error ?? "send failed");
      process.stdout.write(`sent ${res.threadId} → remote\n`);
      if (res.warning) process.stdout.write(`  ⚠ ${res.warning}\n`);
      return;
    }
    case "sync": {
      const parsed = parseFlags(rest, ["--read-only"]);
      const res = await service.sync({ readOnly: parsed.flags["--read-only"] === "true" });
      process.stdout.write(`fetched ${res.fetched} threads; updated ${res.updated}; skipped ${res.skipped}\n`);
      for (const w of res.warnings) process.stdout.write(`  ⚠ ${w}\n`);
      return;
    }
    case "status": {
      const id = rest[0];
      if (!id) die("status needs <thread_id>");
      const view = await service.status(id);
      if (!view.thread) die(`no such thread: ${id}`);
      printStatus(view, service["now" as never] as unknown as Date | undefined);
      return;
    }
    case "logs": {
      const parsed = parseFlags(rest, ["--lines"]);
      const id = parsed.positional[0];
      if (!id) die("logs needs <thread_id>");
      const lines = parsed.flags["--lines"] ? Number(parsed.flags["--lines"]) : undefined;
      const out = await service.logs(id, lines);
      process.stdout.write(out);
      if (out && !out.endsWith("\n")) process.stdout.write("\n");
      return;
    }
    case "machine": {
      const sub = rest[0];
      if (sub === "list") {
        const machines = await service.listMachines();
        printMachines(machines);
        return;
      }
      if (sub === "add") {
        const parsed = parseFlags(rest.slice(1), ["--ssh-host", "--repo", "--role"]);
        const name = parsed.positional[0];
        if (!name) die("machine add needs <name>");
        const m = await service.addMachine({
          name,
          sshHost: parsed.flags["--ssh-host"] ?? null,
          repoPath: parsed.flags["--repo"] ?? null,
          role: (parsed.flags["--role"] as "local" | "remote" | "both") ?? "remote",
        });
        process.stdout.write(`registered machine ${m.name} (${m.id}) ssh-host=${m.sshHost ?? "-"}\n`);
        return;
      }
      die(`unknown 'peach machine' subcommand: ${sub ?? "(none)"}`);
      return;
    }
    case "daemon": {
      await runDaemon(service, rest);
      return;
    }
    default:
      die(`unknown command: ${cmd}\n\n${usage()}`);
  }
}

/** Tail of the CLI: the `peach daemon` RPC invoked on a peer over SSH. */
async function runDaemon(service: HandoffService, rest: string[]): Promise<void> {
  const [sub, ...more] = rest;
  if (sub === "ping") {
    process.stdout.write(await service.daemonPing());
    return;
  }
  // All other daemon subcommands print JSON to stdout.
  let out: unknown = null;
  switch (sub) {
    case "status": out = await service.daemonStatus(more[0]!); break;
    case "pause": out = await service.daemonPause(more[0]!); break;
    case "start": out = await service.daemonStart(more[0]!); break;
    case "checkpoint": out = await service.daemonCheckpoint(more[0]!); break;
    case "worktree": out = await service.daemonWorktree(more[0]!); break;
    case "recovery": out = await service.daemonRecovery(more[0]!); break;
    case "logs": {
      const lines = more[1] ? Number(more[1]) : undefined;
      process.stdout.write(await service.daemonLogs(more[0]!, lines));
      return;
    }
    case "import": {
      const thread = JSON.parse(more[1] ?? "null");
      out = await service.daemonImport(more[0]!, thread);
      break;
    }
    default:
      die(`unknown daemon subcommand: ${sub ?? "(none)"}`);
  }
  if (out !== null) process.stdout.write(JSON.stringify(out, null, 2));
}

// ── formatting ───────────────────────────────────────────────────────
const STATUS_PAD: Record<ThreadStatus, string> = {
  new: "new   ",
  running: "runng ",
  paused: "paused",
  waiting: "wait  ",
  complete: "done  ",
  failed: "failed",
};

function pad(str: string, len: number): string {
  const s = String(str ?? "");
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function printThreads(threads: ReturnType<HandoffService["listThreads"]> extends Promise<infer T> ? T : never): void {
  if (!threads.length) {
    process.stdout.write("No threads yet. Create one: peach remote start \"<task>\"\n");
    return;
  }
  process.stdout.write(
    `${pad("ID", 16)}  ${pad("BRANCH", 38)}  ${pad("OWNER", 12)}  STATUS\n`,
  );
  for (const t of threads) {
    process.stdout.write(
      `${pad(t.id, 16)}  ${pad(t.branch, 38)}  ${pad(t.activeMachine, 12)}  ${STATUS_PAD[t.status]}\n`,
    );
  }
}

interface StatusView {
  thread: import("../src/types.ts").HandoffThread | null;
  owner: import("../src/types.ts").Machine | null;
  git: { dirty: boolean; ahead: number; behind: number; diverged: boolean; lastCommit: string | null } | null;
  self: boolean;
  leaseHeld: boolean;
}

function printStatus(view: StatusView, _now?: Date): void {
  const t = view.thread;
  if (!t) {
    process.stdout.write("no such thread\n");
    return;
  }
  process.stdout.write(`thread      ${t.id}\n`);
  process.stdout.write(`branch      ${t.branch}\n`);
  process.stdout.write(`task        ${t.name}\n`);
  process.stdout.write(`status      ${t.status}\n`);
  process.stdout.write(`owner       ${view.owner?.name ?? t.activeMachine} (${view.self ? "this machine" : "remote"})\n`);
  process.stdout.write(`lease       ${view.leaseHeld ? "held by this machine" : "not held here"}\n`);
  process.stdout.write(`lease util  ${t.leaseExpiresAt ?? "—"}\n`);
  if (view.git) {
    process.stdout.write(`dirty       ${view.git.dirty ? "yes" : "no"}\n`);
    process.stdout.write(`ahead/behind ${view.git.ahead}/${view.git.behind}${view.git.diverged ? " (DIVERGED)" : ""}\n`);
    if (view.git.lastCommit) process.stdout.write(`last commit ${view.git.lastCommit.slice(0, 12)}\n`);
  }
  if (t.workspacePath) process.stdout.write(`workspace   ${t.workspacePath}\n`);
  if (t.pid) process.stdout.write(`pid         ${t.pid}\n`);
  if (t.logPath) process.stdout.write(`logs        ${t.logPath}\n`);
  if (t.recoveryBranch) process.stdout.write(`recovery    ${t.recoveryBranch}\n`);
}

function printMachines(machines: import("../src/types.ts").Machine[]): void {
  if (!machines.length) {
    process.stdout.write("No machines. Add one: peach machine add home --ssh-host home.tail\n");
    return;
  }
  process.stdout.write(`${pad("NAME", 14)}  ${pad("SSH HOST", 18)}  ${pad("ROLE", 6)}  ${pad("STATUS", 8)}\n`);
  for (const m of machines) {
    process.stdout.write(`${pad(m.name, 14)}  ${pad(m.sshHost ?? "-", 18)}  ${pad(m.role, 6)}  ${pad(m.onlineStatus, 8)}\n`);
  }
}

/** Minimal flag parser: pulls named `--flag value` pairs out, leaving positionals. */
function parseFlags(argv: string[], flags: string[]): { positional: string[]; flags: Record<string, string> } {
  const known = new Set(flags);
  const out: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (known.has(a)) {
      out[a] = argv[i + 1] ?? "";
      i++;
    } else if (!a.startsWith("--")) {
      positional.push(a);
    }
  }
  return { positional, flags: out };
}

main(process.argv).catch((err) => die(String((err as Error).message ?? err)));
