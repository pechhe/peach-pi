import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Install the agent-facing Executor skill.
 *
 * Executor's stdio MCP surface is NOT a flat per-API tool catalogue — it is two
 * tools, `execute` (a TypeScript sandbox) and `resume`. The agent therefore
 * needs to be taught the discover→describe→call workflow and the connection/
 * integration management surface, or it can't use connections at all. We ship
 * that as a pi skill at `~/.pi/agent/skills/executor/SKILL.md`, mirroring how
 * CuaDriverService installs its skill. Idempotent: only rewrites on version
 * bump (the marker line in the body).
 */
const SKILL_DIR = join(homedir(), ".pi", "agent", "skills", "executor");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
const VERSION = "001";

const BODY = `---
name: executor
description: Use Executor to call the user's connected third-party services (SaaS APIs, OpenAPI/GraphQL endpoints, MCP servers) and to add integrations or create connections. Use whenever a task needs an external service the user has connected — send email, query an API, post to a SaaS tool — or when asked to connect/add a new integration or connection.
---

<!-- executor-skill v${VERSION} -->
# Executor connections

Executor is the local proxy for the user's connected services. It is registered
as the \`executor\` MCP server and exposes exactly two tools: \`execute\` and
\`resume\`. There is NO flat per-API tool list — you discover and call everything
through \`execute\`. Credentials stay inside Executor; you never see them.

\`execute\` runs TypeScript in a sandbox with a \`tools\` object.

## Core loop: call an existing tool

1. Search by intent:
   \`const { items } = await tools.search({ query: "<intent + key nouns>", limit: 12 });\`
2. Pick a path: \`const path = items[0]?.path; if (!path) return "No matching tool.";\`
3. Inspect the schema: \`const d = await tools.describe.tool({ path });\`
   (use \`d.inputTypeScript\` / \`d.outputTypeScript\`).
4. Call it: \`tools.<source>...<op>(args)\` — e.g. \`tools.github.issues.create({ title: "Hi" })\`.

Chain several calls in one \`execute\` when it saves round-trips.

## See what's connected

- \`await tools.executor.coreTools.connections.list({})\` — saved connections.
- \`await tools.executor.coreTools.integrations.list({})\` — catalogue integrations.

Executor allows MANY connections per integration (e.g. two GitHub accounts). An
integration is the catalogue entry; a connection is a credentialed instance of it.

## Add an integration (catalogue entry)

- OpenAPI: \`tools.executor.openapi.addSpec({ ... })\` (dry-run with \`openapi.previewSpec\`).
- GraphQL: \`tools.executor.graphql.*\`.
- Upstream MCP server: \`tools.executor.mcp.addServer({ ... })\`.

## Create a connection (credentialed instance)

- API key / token: \`tools.executor.coreTools.connections.create({ ... })\`.
- OAuth: \`tools.executor.coreTools.oauth.start({ ... })\`, then have the USER finish
  in the browser; \`connections.createHandoff\` makes a link for the user to complete auth.

Do NOT fabricate secrets or complete OAuth on the user's behalf. Creating a
connection needs the user's credentials or consent — initiate the flow, then ask
the user to finish it. Treat connection creation and writes as approval-gated.

## Paused executions

If a call needs approval or auth mid-run, the execution pauses. Use the \`resume\`
tool with the execution id once the user has approved or authenticated.
`;

export async function ensureExecutorSkill(): Promise<void> {
  try {
    const current = await readFile(SKILL_PATH, "utf8").catch(() => "");
    if (current.includes(`executor-skill v${VERSION}`)) return;
    await mkdir(SKILL_DIR, { recursive: true });
    await writeFile(SKILL_PATH, BODY, "utf8");
  } catch (err) {
    console.warn("[executor-skill] install:", (err as Error)?.message ?? err);
  }
}
