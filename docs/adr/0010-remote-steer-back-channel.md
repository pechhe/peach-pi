# ADR-0010: Remote steer-back channel (write path)

Status: Accepted (2026-06-24)

## Decision

The mobile PWA (ADR-0009's read-only tap) becomes a **control surface**. The
master relay grows a token-gated **write path** alongside the existing read
path, so the phone can:

- **send a message** to a served thread (prompt when idle, queue a follow-up
  while running) and **stop** a running turn,
- **start a new thread** in a served project (or a new chat),
- run **git actions** on a thread — commit & push, open a PR, merge to local.

This is the steer-back channel ADR-0009 explicitly deferred:

> *"v1 is observe-only. A steer-back channel (turning the read-only tap
> bidirectional) is deferred; revisit as a follow-up ADR if needed."*

This ADR is that revisit.

## Why this is safe enough

The relay's security model is unchanged from ADR-0009: **the tailnet + a shared
bearer token are the entire boundary**, the relay binds only to the Tailscale
interface (never `0.0.0.0`), and serving is off by default. The write path adds
**no new auth tier** — anything already trusted to *read* a transcript (which
can contain secrets and source) is trusted to *steer* it.

We accept the larger blast radius (a tailnet peer with the token can now run the
agent and push git) because:

- the master runs in an **auto-approval** tool mode — there is no permission
  prompt to bypass, so "read the transcript" already implies "watch it touch the
  machine"; steering does not cross a new trust line;
- **destructive git actions** (open PR, merge to local) are gated behind a
  one-tap **UI confirmation** on the phone. This is UX friction, not a second
  auth tier — the token still authorises everything.

## Surface added to the relay

CORS widens to allow `POST`. New routes (all token-gated, same as reads):

```
POST /sessions/:threadId/message   { text }   → prompt (idle) | follow-up (running)
POST /sessions/:threadId/steer     { text }   → immediate steer
POST /sessions/:threadId/abort                → stop the running turn
POST /sessions/:threadId/queue/delete { kind, index }
POST /threads                      { projectId } → RemoteSessionInfo
POST /chats                                   → RemoteSessionInfo
POST /sessions/:threadId/git/commit-push { message? } → GitCommitPushResult
POST /sessions/:threadId/git/pr               → GitPrResult
POST /sessions/:threadId/git/merge            → GitMergeResult
GET  /projects                                → RemoteProjectInfo[]  (for new-thread picker)
```

The relay holds **no business logic** — it calls a `RelayActions` dependency
that forwards to the existing `thread-service` / `git-service` verbs, exactly as
the read path's `RelayDeps` reads from them. No new capability is invented; the
phone just reaches the verbs the desktop renderer already has.

## Live state on the tap

Two new `RemoteTapFrame` kinds let the composer mirror the desktop composer
without polling:

- `status` — running/idle, so "send" morphs into "stop";
- `queue` — steering + follow-up backlog, so queued messages are visible and
  deletable.

Both are second subscribers to the same `setStatus` / `onQueueChange` emissions
the renderer gets — the ADR-0009 "second subscriber" pattern, extended.

## Consequences

- The relay is no longer a pure read tap; `RelayActions` is the new seam and
  must stay a thin forwarder (no logic) so the desktop and phone never diverge.
- `createPr` opens the compare URL via `shell.openExternal` on the **master**,
  so a master-side browser tab pops when a PR is requested from the phone; the
  URL is also returned for the phone to open. Acceptable for v1.
- Still macOS arm64, still tailnet-only, still off by default. The `broker/`
  worker stays uninvolved.
