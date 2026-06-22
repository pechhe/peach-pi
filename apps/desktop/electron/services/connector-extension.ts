import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Installs the `peach-connectors` pi extension into the global auto-discovered
 * location (`~/.pi/agent/extensions/`). pi loads it on session start; the
 * extension talks back to peach-pi's ConnectorResolver over localhost.
 *
 * The extension source is embedded here (not a packaged asset) so packaging
 * stays simple and the version we ship is the version that runs. We only rewrite
 * the file when our VERSION marker changes, so we don't clobber a freshly loaded
 * copy on every launch.
 */
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");
const EXTENSION_PATH = join(EXTENSIONS_DIR, "peach-connectors.ts");
const VERSION = "003";

// NOTE: no backticks / no ${} inside this string — keeps embedding clean.
// The extension is plain TS, run by pi's strip-types loader.
const EXTENSION_SOURCE = [
  "// AUTO-INSTALLED by peach-pi. Source: apps/desktop/electron/services/connector-extension.ts",
  "// peach-connectors v" + VERSION,
  'import { readFile } from "node:fs/promises";',
  'import { homedir } from "node:os";',
  'import { join } from "node:path";',
  'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
  'import { Type } from "typebox";',
  "",
  'const BOOTSTRAP = join(homedir(), ".pi", "agent", "peach-connectors.json");',
  "",
  'type ToolOut = { content: { type: "text"; text: string }[]; details: Record<string, unknown> };',
  "interface Bootstrap { baseUrl: string; token: string; }",
  "",
  "async function readBootstrap(): Promise<Bootstrap | null> {",
  "  try {",
  "    const raw = JSON.parse(await readFile(BOOTSTRAP, \"utf8\"));",
  "    if (raw && raw.baseUrl && raw.token) return raw;",
  "    return null;",
  "  } catch {",
  "    return null;",
  "  }",
  "}",
  "",
  "function txt(text: string) {",
  "  return { type: \"text\" as const, text };",
  "}",
  "",
  "export default function (pi: ExtensionAPI) {",
  "  // Discovery: which connectors does the user have connected?",
  "  pi.registerTool({",
  "    name: \"connectors_list\",",
  "    label: \"List connected services\",",
  "    description:",
  "      \"List external services the user has connected in peach-pi (Connections).\" +",
  "      \" Returns provider ids, labels, whether each is connected, and the REST base\" +",
  "      \" URL if known. Call this before connector_call to see what is available.\",",
  "    parameters: Type.Object({}),",
  "    async execute(_toolCallId, _params, signal): Promise<ToolOut> {",
  "      const b = await readBootstrap();",
  "      if (!b) return { content: [txt(\"peach-pi is not running. Start the peach-pi app, then retry.\")], details: {} };",
  "      const res = await fetch(b.baseUrl + \"/connectors\", {",
  "        headers: { authorization: \"Bearer \" + b.token },",
  "        signal,",
  "      });",
  "      const body = await res.text();",
  "      return { content: [txt(body)], details: { status: res.status } };",
  "    },",
  "  });",
  "",
  "  // Generic REST call against any connected provider.",
  "  pi.registerTool({",
  "    name: \"connector_call\",",
  "    label: \"Call a connected service\",",
  "    description:",
  "      \"Call an external service the user connected in peach-pi. peach-pi injects\" +",
  "      \" the stored auth header automatically. Provide the provider id, an HTTP\" +",
  "      \" method, and the REST path (appended to the provider apiBaseUrl). body is\" +",
  "      \" sent as JSON. If unsure which provider id / path to use, call\" +",
  "      \" connectors_list first.\",",
  "    parameters: Type.Object({",
  "      provider: Type.String({ description: \"Connector provider id, e.g. notion, github, linear.\" }),",
  "      method: Type.Optional(Type.String({ description: \"HTTP method. Default GET.\" })),",
  "      path: Type.Optional(Type.String({",
  "        description: \"REST path appended to the provider apiBaseUrl, e.g. \\\"v1/users/me\\\".\",",
  "      })),",
  "      query: Type.Optional(Type.Record(Type.String(), Type.String())),",
  "      body: Type.Optional(Type.Unknown({ description: \"JSON request body.\" })),",
  "      headers: Type.Optional(Type.Record(Type.String(), Type.String())),",
  "    }),",
  "    async execute(_toolCallId, params, signal): Promise<ToolOut> {",
  "      const b = await readBootstrap();",
  "      if (!b) return { content: [txt(\"peach-pi is not running. Start the peach-pi app, then retry.\")], details: {} };",
  "      const credRes = await fetch(",
  "        b.baseUrl + \"/connectors/\" + encodeURIComponent(params.provider) + \"/credentials\",",
  "        { headers: { authorization: \"Bearer \" + b.token }, signal },",
  "      );",
  "      if (credRes.status === 404) {",
  "        return {",
  "          content: [txt(\"No connected connector for provider '\" + params.provider + \"'. Ask the user to add one in peach-pi → Connections, then retry.\")],",
  "          details: { connected: false },",
  "        };",
  "      }",
  "      if (!credRes.ok) return { content: [txt(\"Resolver error \" + credRes.status)], details: {} };",
  "      const cred = (await credRes.json()) as {",
  "        provider: string; apiBaseUrl: string | null; headers: Record<string, string>; expiresAt: string | null;",
  "      };",
  "      if (!cred.apiBaseUrl) {",
  "        return { content: [txt(\"Provider '\" + params.provider + \"' has no known REST base URL. Construct the full URL from the provider docs instead.\")], details: {} };",
  "      }",
  "      const url = new URL(cred.apiBaseUrl);",
  "      if (params.path) {",
  "        url.pathname = url.pathname.replace(/\\/$/, \"\") + \"/\" + params.path.replace(/^\\//, \"\");",
  "      }",
  "      if (params.query) {",
  "        for (const entry of Object.entries(params.query)) url.searchParams.set(entry[0], entry[1]);",
  "      }",
  "      const res = await fetch(url, {",
  "        method: params.method || \"GET\",",
  "        headers: Object.assign(",
  "          { \"content-type\": \"application/json\" },",
  "          cred.headers,",
  "          params.headers || {},",
  "        ),",
  "        body: params.body == null ? undefined : JSON.stringify(params.body),",
  "        signal,",
  "      });",
  "      const text = await res.text();",
  "      return {",
  "        content: [txt(res.status + \" \" + url.pathname + \"\\n\" + text)],",
  "        details: { status: res.status, url: url.href, expiresAt: cred.expiresAt },",
  "      };",
  "    },",
  "  });",
  "}",
].join("\n");

/** Write the extension if missing or out of date. Safe to call on every launch. */
export async function ensureConnectorExtension(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true });
  let existing = "";
  try {
    existing = await readFile(EXTENSION_PATH, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("peach-connectors v" + VERSION)) return;
  await writeFile(EXTENSION_PATH, EXTENSION_SOURCE, "utf8");
}
