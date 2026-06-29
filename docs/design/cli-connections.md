# Design: CLIs as a Connections category

Command-line tools (`vercel`, `gh`, `fly`, `supabase`, `wrangler`) surface as a
**CLIs** category in the Connections view, alongside Composio toolkits, custom
HTTP connections, and MCP servers.

## Mental model

CLIs are external things peach-pi talks to, so they belong in Connections — but
they are not "connected" the way an OAuth account is. A CLI has two independent
facts:

- **installed?** — is the binary on PATH?
- **authenticated?** — does the tool's own auth-check command report a login?

The UI renders these as one badge per row (green = authed, amber = installed but
not authed, grey = not installed), not a single "connected" state.

## No `cli_run` tool

The agent invokes CLIs through its **normal shell tool** plus per-CLI **skills**
(e.g. the `vercel-cli` skill). peach-pi adds **no** generic `cli_run` model
tool. Detection + login is the whole surface.

## Auth stays in the CLI

`cli:login` opens a Terminal window running the tool's own login command
(`vercel login`, `gh auth login`, …). Browser-OAuth flows and interactive
prompts both work there. Auth lands in the CLI's own config (`~/.vercel`,
`~/.config/gh`, …) — peach-pi never stores or injects tokens. Because the
agent's shell inherits the same config, authenticated CLIs Just Work.

We cannot observe when an external login completes, so after launch the status
cache is dropped and the user clicks **Re-check** (or revisits the page) to see
the flipped badge.

## Pieces

- `packages/shared-types`: `CliStatus` entity + `cli:list` / `cli:refresh` /
  `cli:login` invoke contracts + `event:clisChanged`.
- `electron/services/cli-registry.ts`: `KNOWN_CLIS: CliDescriptor[]` — one entry
  per CLI (version/auth/login commands + install hint + docs URL). Add a CLI =
  one entry here.
- `electron/services/cli-service.ts`: probes each CLI (binary resolved through
  the login shell so npm/homebrew installs are found), TTL-cached like
  `BwsService`; `login()` launches the Terminal flow.
- `src/app/ConnectorsView.svelte`: the CLIs sidebar section + detail pane.

## Deferred

Injecting the detected-CLI list into the agent's session context (so it knows
what's available without probing) is a follow-up — it needs the system-prompt
injection hook, and the agent can already discover CLIs via its shell + skills.

## macOS only

`cli:login` uses `osascript` to open Terminal.app, matching the app's macOS
target (same constraint as `BwsService.install`).
