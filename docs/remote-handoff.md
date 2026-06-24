# Remote handoff — movable execution

Status: Accepted (2026-06-24) · Package: `@peach-pi/remote-handoff`

## The model

Peach supports **movable execution**: running an expensive coding-agent/thread
process on one machine while the user controls it from another, taking it back
locally, and later handing it off again. This is **not** a fixed master/slave
system. Each thread has an **active owner machine**; at any point a thread is
owned by exactly one machine, and only the owner may mutate that thread's
workspace.

```
        ┌─────────┐  take   ┌─────────┐  send   ┌─────────┐
thread  │  home   │ ◀────── │  local  │ ──────▶ │  home   │
        │ (owner) │         │ (owner) │         │ (owner) │
        └─────────┘         └─────────┘         └─────────┘
             │                   │                   │
             ▼                   ▼                   ▼
        git branch          git branch          git branch
        peach/<id>          peach/<id>          peach/<id>
        + worktree          + worktree          + worktree
```

The boundary mirrors ADR-0009's split: **code crosses as git** (a dedicated
`peach/<id>-<slug>` branch per thread, one worktree per machine per thread),
**status/logs/control cross over the transport** (SSH over Tailscale for MVP).
There is no shared registry over the wire — each machine keeps its own; the two
converge through git and through transport RPC calls.

### Relationship to ADR-0009/0010 (remote session hosting)

ADR-0009/0010 host the desktop app's *pi conversation session* over Tailscale
(read-only tap + steer-back over a WebSocket relay, `wip/<sessionId>` checkpoint
branches). This subsystem is a **complement, not a replacement**:

| | ADR-0009 (session hosting) | Remote handoff (this) |
|---|---|---|
| Unit | pi conversation session (`ThreadId`) | movable work unit (`HandoffThread`) |
| Transport | tailnet WebSocket relay | SSH commands |
| Branch | `wip/<sessionId>` (snapshot, non-destructive) | `peach/<id>-<slug>` (real commits, the work) |
| Surface | desktop GUI + mobile PWA | CLI (`peach`) |
| Ownership | implicit (master serves) | **explicit per-thread lease** |

The two can coexist on the same repo — branch namespaces never collide.

## Commands

```
peach threads                                   list known threads
peach remote start "<task>" [--machine home]    create + start a thread on a (remote) machine
peach take <thread_id> [--force]               take ownership to this machine
peach send <thread_id> [--machine home]         hand ownership back to remote
peach sync [--read-only]                        fetch branches; update owned worktrees only
peach status <thread_id>                        owner, lease, git, process status
peach logs <thread_id> [--lines N]             print the owner's log
peach machine add <name> --ssh-host <host>       register a peer machine
peach machine list                              list registered machines
peach daemon <sub> <args...>                    internal RPC run on a peer over SSH
```

Environment: `PEACH_MACHINE` (this machine's name), `PEACH_REPO` (shared repo
path), `PEACH_COMMAND` (worker command, e.g. `pi chat`), `PEACH_ROOT` (`~/.peach`).

## Workflows

### Remote-first

```bash
# on the local laptop
peach machine add home --ssh-host home.tailnet   # one-time
peach remote start "implement auth flow"        # home owns + runs it
peach threads
peach logs thread_a1b2c3                         # polled over SSH
```

### Taking back control

```bash
peach take thread_a1b2c3      # home pauses, checkpoints, pushes; local fetches + leases
cd ~/.peach/workspaces/thread_a1b2c3
# ...work locally...
```

### Sending back to remote

```bash
peach send thread_a1b2c3      # local checkpoints + pushes; home fetches + resumes
peach logs thread_a1b2c3      # now tails home's worker again
```

### Hybrid

```bash
peach threads
peach take thread_a1b2c3
peach send thread_def456
```

## Registry fields

Thread:

| field | meaning |
|---|---|
| `id` | short id (`thread_<6hex>`) |
| `name` | task description |
| `branch` | `peach/<id>-<slug>` |
| `status` | `new` \| `running` \| `paused` \| `waiting` \| `complete` \| `failed` |
| `activeMachine` | machine id currently owning the thread |
| `leaseOwner` | machine id holding the lease (== `activeMachine` while leased) |
| `leaseExpiresAt` | ISO timestamp; null when released |
| `workspacePath` | worktree dir on the *owning* machine |
| `lastCommit` | HEAD sha |
| `hasUncommittedChanges` | dirty-tree flag |
| `createdAt` / `updatedAt` | timestamps |
| `baseBranch` | branch the thread branched from (e.g. `main`) |
| `command` | worker command launched on start/resume |
| `pid` | worker pid on the owning machine |
| `logPath` | `~/.peach/logs/<id>.log` |
| `recoveryBranch` | set by a forced takeover |

Machine: `id`, `name`, `role` (`local`/`remote`/`both`), `repoPath`,
`workspaceRoot`, `onlineStatus`, `lastSeenAt`, `sshHost`.

State lives under `~/.peach/`:

```
~/.peach/
  threads.json     local thread registry (JSON)
  machines.json    machine records + self id
  workspaces/<id>/ per-thread git worktrees
  logs/<id>.log    per-thread worker logs
```

## Safety rules (enforced)

1. **A machine must not mutate a thread unless it owns the lease.**
   `send` checks `canMutate`; `take` refuses without `--force` if it can't
   pause the owner.
2. **Handoff checkpoints before transferring ownership.** Every `take`/`send`
   requests a `wip(<id>): checkpoint before handoff` commit (tracked +
   untracked, minus ignored) and pushes the thread branch before the lease
   moves. Clean trees skip the commit (`null` sha) — it's idempotent.
3. **A dirty workspace is never silently overwritten.** `sync` uses `--ff-only`;
   divergence refuses the fast-forward and leaves the local worktree untouched.
4. **Divergence creates a recovery branch or requires explicit action.**
   `take --force` captures `recovery/<id>-<machine>-<timestamp>` pointing at the
   pre-empted owner's tip before taking whatever origin has.
5. **Sync only mutates owned worktrees.** Unowned threads are fetched (metadata
   refresh) but never checked out, unless `--read-only` (no checkout writes at
   all).
6. **Errors leave the thread recoverable.** Git failures are caught; a failed
   push surfaces a warning rather than aborting the lease transfer.

## Layers

```
packages/remote-handoff/
  src/
    types.ts       Machine, HandoffThread, RemoteThreadStatus, config
    ids.ts         thread id / branch / recovery / wip-message naming
    lease.ts       pure ownership/lease decisions (canTake, canMutate, acquire…)
    registry.ts    JSON-backed ThreadRegistry + MachineRegistry
    git.ts         GitWorkspace: fetch, worktree, ff, wipCheckpoint, recovery
    transport.ts   RemoteTransport interface + SshTransport + LocalTransport
    process.ts     worker spawn (detached, tee'd to log) + stop
    logs.ts        log path + read/append
    handoff.ts     HandoffService orchestrator (the only safety decision point)
  bin/peach.ts     CLI (user verbs + daemon RPC)
  tests/           temp real git repos; FakeTransport for handoff e2e
```

The transport is an interface so it can be swapped (the repo's existing
tailnet HTTP relay, or a native RPC) without touching `HandoffService`.

## Known limitations (MVP)

- **No live process memory migration.** `take`/`send` pauses/stops then
  start/resume relaunches the command on the new owner.
- **Logs are polled**, not truly streamed.
- **Registry is local JSON** (`threads.json`), not shared. Two machines
  converge through git + transport RPC. A swap to `node:sqlite` (the repo's
  ADR-0001 seam) is a one-file change in `registry.ts`.
- **One configured remote** at a time is the happy path; multiple remotes
  work but aren't tuned.
- **The worker command is a stub** by default (`echo …; sleep`) so status reads
  "running". Set `PEACH_COMMAND` (e.g. `pi chat`) for a real agent runtime.
- **`peach daemon <sub>` must be on the peer's PATH** for the SSH transport to
  reach it; a login shell keeps nvm/homebrew PATH.

### Future improvements

- True log streaming (SSE/WebSocket) instead of polling.
- A long-running `peach daemon` process (vs per-command SSH) for lower
  handoff latency.
- Shared/replicated registry over the transport (or a tiny tailnet key-value
  store) so threads don't need explicit `import`.
- Auto-WIP heartbeat commits on a timer while owned, not just at handoff.
- Worktree pruning / archival for completed threads.

## Decision: JSON registry

The desktop app uses `node:sqlite` (`DatabaseSync`, ADR-0001). This package
uses **JSON files** instead. The tradeoff is deliberate:

- **Pro:** the host `peach` CLI runs on any laptop's Node without a native
  sqlite build or experimental flag; the registry is human-readable and
  git-friendly.
- **Con:** no transactions, no concurrent writers — acceptable because each
  machine only writes its *own* local registry, and the CLI is single-invocation.

If the registry grows complex enough to need queries/transactions, swap to the
same `DatabaseSync` seam the desktop app already wraps in `persistence/db.ts`;
the interface in `registry.ts` isolates the change to one file.
