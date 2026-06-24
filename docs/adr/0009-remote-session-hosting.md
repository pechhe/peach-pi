# ADR-0009: Remote session hosting over Tailscale

Status: Accepted (2026-06-24)

## Decision

peach-pi can **host** a running session and **attach** to one — the same app
plays both roles. On an always-on master Mac, peach-pi serves its existing
`AgentSession` over the Tailscale network as a read-only **session tap** (the
live conversation), while snapshotting the working tree to disposable
**checkpoint branches** (`wip/<sessionId>`) so the work travels by git. On a
laptop, peach-pi attaches to a host session, renders the conversation read-only
in the existing timeline, and pulls a checkpoint branch into an isolated worktree
to test.

The boundary is split: **code crosses as git** (checkpoint branches pushed to
origin), **conversation crosses as a one-way event stream** over the tailnet. v1
is observe-only — you watch and pull, you do not steer the remote pi.

## Considered Options

- **Standalone headless daemon** on the master (a separate binary running
  `pi --mode rpc`, exposing its stdio). Language-agnostic, works on Linux, but a
  second codebase to build and keep in sync with peach-pi's session handling.
- **SSH/VNC into the master** and drive peach-pi or pi by hand. Zero build, but
  no structured tap, no first-class "pull to test", and tied to a live session.
- **Working-tree sync** (Syncthing/rsync) of the master's repo, or **patch
  artifacts** (`git diff` shipped and `git apply`'d). Captures uncommitted work
  but is fiddly with untracked/binary files and gives no checkout-able ref.
- **Host from peach-pi itself + disposable checkpoint branches** (chosen).

## Why

- **The host already exists.** peach-pi owns an `AgentSession` in Electron main
  and already fans the conversation out as `thread-service` events
  (`event:transcript` with a monotonic `transcriptSeq`, `event:sessionMeta`,
  `event:queue`) to its renderer. The tap is a *second subscriber* to those same
  emissions — no `pi --mode rpc` subprocess, no second codebase. (The pi SDK
  itself recommends in-process `AgentSession` over spawning RPC for a Node host.)
- **Checkpoint branches solve "don't commit if it's wrong".** A commit on a
  `wip/<sessionId>` branch is *transport, not endorsement*. Snapshots include
  untracked files, are pushed to origin (pullable even with the tailnet down),
  and are squashed/cherry-picked if good or deleted if wrong — real history is
  never polluted. `agent_end` is the natural snapshot trigger, so the tap stream
  and the checkpoint cadence derive from the same source.
- **Snapshots must not disturb the agent.** Checkpoints are built with a
  temporary git index + `commit-tree`, never touching HEAD, the index, or the
  working tree, so snapshotting cannot fight the agent's own git use.
- **Tailnet is the security model.** Transcripts contain source and possibly
  secrets and cannot be meaningfully redacted. So the relay binds **only** to the
  Tailscale interface (never `0.0.0.0`), requires a shared token, and is off by
  default behind a `remote.serve` setting. Bind correctness is a tested
  invariant, not an afterthought. The `broker/` Cloudflare worker stays
  OAuth-only and is not involved.

## Consequences

- Hosting assumes the master runs peach-pi (macOS). A headless-Linux master would
  break the "same app, two roles" decision and require the standalone-daemon
  option above.
- A new `session-relay` service (WebSocket, tailnet-bound, token-auth) and a new
  `checkpoint` service are added to Electron main; all renderer/main interactions
  go through typed `ipcContracts` in `packages/shared-types`.
- Late-join and reconnect use `transcriptSeq` as the cursor to dedup backfill vs.
  live tail.
- v1 is observe-only. A steer-back channel (turning the read-only tap
  bidirectional) is deferred; revisit as a follow-up ADR if needed.
- Running pulled work still needs `node_modules`/env; only install is in scope,
  env setup is manual. Both ends are assumed macOS arm64.
