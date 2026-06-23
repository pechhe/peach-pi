# ADR-0008: pi-agent-browser-native for native web computer use

Status: Accepted (2026-06-22)

## Decision

peach-pi adopts **`pi-agent-browser-native`** (npm, MIT — `fitchmultz/pi-agent-browser-native`)
as the native web computer-use package. It exposes a single native `agent_browser`
tool in pi, replacing the brittle `agent-browser` shell-command style the
`agent-browser` skill previously taught. The agent now drives real browser
sessions with typed, validated tool calls (`args` / `semanticAction` / `job` /
`qa` / `electron`) instead of quoting CLI argv by hand.

## Why a package, not a vendored extension

Unlike the Cua Driver toolset (ADR-0007), which is a small self-contained
extension written into `~/.pi/agent/extensions/`, `pi-agent-browser-native` is a
**large TypeScript package with a build step** (`dist/`) and a wide surface
(snapshots, refs, artifacts, redaction, recovery, Electron lifecycle). Vendoring
it as a single `extensions/*.ts` file is not viable.

It therefore goes through pi's **`packages`** mechanism: `pi install
npm:pi-agent-browser-native` (idempotent — pi skips when present). This is the
same path as `pi-vision-proxy`, `pi-cymbal`, `pi-mcp-adapter`, etc., and it
benefits from `pi update --extensions` keeping it current.

## How it ships

- peach-pi runs `pi install npm:pi-agent-browser-native` on boot **if absent and
  not yet attempted** — a one-time background install (~2s when the upstream
  package is warm; longer on first fetch). Never blocks boot; emits a notice.
- Install state is read from `packages[]` in `~/.pi/agent/settings.json` (fast,
  no network) and surfaced read-only in the Connections view, with an "Install"
  affordance if missing.
- The package itself ships the tool + its generated playbook; the agent
  discovers usage from the tool descriptions, not from a peach-pi-owned skill.

## Dependency: upstream `agent-browser` binary

`pi-agent-browser-native` is a thin wrapper — it does **not** bundle the browser
engine. The upstream `agent-browser` CLI must be on PATH (`npm i -g
agent-browser`). The existing `agent-browser` skill (owned by that binary, in
`~/.pi/agent/skills/agent-browser/`) remains valid for direct CLI use and is not
touched by peach-pi.

## Position in the computer-use stack

Extends the 3-tier ladder from ADR-0007:

1. **Programmatic** (CLI / API / connector) — always preferred.
2. **Web pages → `agent_browser`** (was: `agent-browser` CLI) — DOM-aware via
   CDP, now a native tool. `pi-agent-browser-native` makes this tier typed.
3. **Native desktop UI → `cua-driver`** — macOS apps, system dialogs.

## Consequences

- Adds `npm:pi-agent-browser-native` to `packages[]`. Users can `pi remove` it
  if unwanted; peach-pi will re-surface the install affordance.
- Bumping: `pi update --extensions` handles it; no pin in peach-pi beyond the
  install-on-boot trigger.
- First-run install requires network + the npm registry. Users offline at first
  launch see the "Install" button and can retry.
