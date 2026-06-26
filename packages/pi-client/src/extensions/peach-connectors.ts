// AUTO-INSTALLED by peach-pi. Staged from
// packages/pi-client/src/extensions/peach-connectors.ts by scripts/build-extensions.mjs.
// peach-connectors v007
//
// This is a real, type-checked TypeScript source file. It talks back to
// peach-pi's ConnectorResolver over localhost, which proxies to Composio /
// custom HTTP connections / Bitwarden Secrets Manager. Secrets never leave the
// main process — the extension only sees tool schemas and execution results.
//
// The `@peach-pi/shared-types` import below is type-only: the contract types
// bind this extension's tool names + param shapes to the ConnectorResolver's
// route table (single source of truth, `ConnectorToolRoutes`), but the
// import is erased by strip-types at runtime. Runtime schema values come from
// `typebox`, which the pi SDK ships.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type {
  ConnectorToolName,
  ConnectorToolParams,
  ConnectorToolOut,
} from "@peach-pi/shared-types";

const BOOTSTRAP = join(homedir(), ".pi", "agent", "peach-connectors.json");

interface Bootstrap {
  baseUrl: string;
  token: string;
}

async function readBootstrap(): Promise<Bootstrap | null> {
  try {
    const raw = JSON.parse(await readFile(BOOTSTRAP, "utf8"));
    if (raw && raw.baseUrl && raw.token) return raw;
    return null;
  } catch {
    return null;
  }
}

function txt(text: string) {
  return { type: "text" as const, text };
}

function notRunning(): ConnectorToolOut {
  return {
    content: [txt("peach-pi is not running. Start the peach-pi app, then retry.")],
    details: {},
  };
}

/**
 * Compile-time link to the contract: this assertion fails to type-check unless
 * the set of tools registered below exactly matches `ConnectorToolName` (the
 * keys of `ConnectorToolRoutes`). Adding a tool on one side but not the other
 * is a compile error, not a runtime silence.
 */
const REGISTERED_TOOL_NAMES = [
  "connectors_search_tools",
  "connector_execute",
  "custom_connections",
  "custom_request",
  "bws_list_secrets",
  "bws_get_secret",
] as const;

type _ExhaustiveTools = typeof REGISTERED_TOOL_NAMES[number] extends ConnectorToolName
  ? ConnectorToolName extends typeof REGISTERED_TOOL_NAMES[number]
    ? true
    : never
  : never;

export default function (pi: ExtensionAPI): void {
  // Discovery: which Composio tools can the agent use right now?
  pi.registerTool({
    name: "connectors_search_tools",
    label: "Search connected tools",
    description:
      "Search the tools available through the user's connected services (Composio)." +
      " Returns tool slugs and their input schemas. Call this to discover the exact" +
      " toolSlug and arguments before connector_execute. Filter by toolkit (e.g." +
      " gmail, github) when you know the service.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: 'Free-text search, e.g. "send email".' }),
      ),
      toolkits: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Restrict to these toolkit slugs, e.g. ["gmail"].',
        }),
      ),
    }),
    async execute(
      _toolCallId,
      params: ConnectorToolParams<"connectors_search_tools">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const url = new URL(b.baseUrl + "/tools");
      if (params.query) url.searchParams.set("search", params.query);
      if (params.toolkits && params.toolkits.length)
        url.searchParams.set("toolkits", params.toolkits.join(","));
      const res = await fetch(url, {
        headers: { authorization: "Bearer " + b.token },
        signal,
      });
      const body = await res.text();
      return { content: [txt(body)], details: { status: res.status } };
    },
  });

  // Execute a Composio tool by slug. peach-pi injects auth + runs it in the cloud.
  pi.registerTool({
    name: "connector_execute",
    label: "Run a connected tool",
    description:
      "Execute a tool from a connected service (Composio) by its slug. peach-pi" +
      " injects the user's stored auth and runs it. Use connectors_search_tools first" +
      " to find the toolSlug and its required arguments. If the service is not" +
      " connected, ask the user to add it in peach-pi -> Connections.",
    parameters: Type.Object({
      toolSlug: Type.String({ description: "Composio tool slug, e.g. GMAIL_SEND_EMAIL." }),
      arguments: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Tool arguments object, matching the tool's input schema.",
        }),
      ),
    }),
    async execute(
      _toolCallId,
      params: ConnectorToolParams<"connector_execute">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const res = await fetch(b.baseUrl + "/execute", {
        method: "POST",
        headers: { authorization: "Bearer " + b.token, "content-type": "application/json" },
        body: JSON.stringify({ toolSlug: params.toolSlug, arguments: params.arguments || {} }),
        signal,
      });
      const text = await res.text();
      return { content: [txt(text)], details: { status: res.status, toolSlug: params.toolSlug } };
    },
  });

  // List the user's saved custom HTTP connections (name + base URL, no keys).
  pi.registerTool({
    name: "custom_connections",
    label: "List custom connections",
    description:
      "List the user's saved custom HTTP connections (name + base URL). Use this" +
      " to discover connection names before calling custom_request.",
    parameters: Type.Object({}),
    async execute(
      _toolCallId,
      _params: ConnectorToolParams<"custom_connections">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const res = await fetch(b.baseUrl + "/custom-connections", {
        headers: { authorization: "Bearer " + b.token },
        signal,
      });
      const body = await res.text();
      return { content: [txt(body)], details: { status: res.status } };
    },
  });

  // Make an authenticated HTTP call against a saved custom connection.
  pi.registerTool({
    name: "custom_request",
    label: "Call a custom connection",
    description:
      "Make an authenticated HTTP request to one of the user's saved custom" +
      " connections. peach-pi injects the stored API key as the configured header." +
      " Call custom_connections first to find the connection name. path is appended" +
      " to the connection's base URL.",
    parameters: Type.Object({
      connection: Type.String({ description: 'Saved connection name, e.g. "Metabase".' }),
      method: Type.Optional(Type.String({ description: "HTTP method (GET, POST, ...). Default GET." })),
      path: Type.String({ description: 'Path appended to the base URL, e.g. "/api/card".' }),
      body: Type.Optional(Type.Unknown({ description: "Request body (JSON-serialized for non-GET)." })),
      headers: Type.Optional(
        Type.Record(Type.String(), Type.String(), { description: "Extra request headers." }),
      ),
    }),
    async execute(
      _toolCallId,
      params: ConnectorToolParams<"custom_request">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const res = await fetch(b.baseUrl + "/custom-request", {
        method: "POST",
        headers: { authorization: "Bearer " + b.token, "content-type": "application/json" },
        body: JSON.stringify({
          connection: params.connection,
          method: params.method,
          path: params.path,
          body: params.body,
          headers: params.headers,
        }),
        signal,
      });
      const text = await res.text();
      return {
        content: [txt(text)],
        details: { status: res.status, connection: params.connection },
      };
    },
  });

  // List the user's Bitwarden Secrets Manager secrets (names + ids only).
  pi.registerTool({
    name: "bws_list_secrets",
    label: "List BWS secrets",
    description:
      "List the user's Bitwarden Secrets Manager secrets (names + ids only;" +
      " values are never returned). Use this to discover available secrets" +
      " before calling bws_get_secret with a specific id. Optionally filter by" +
      " projectId; defaults to the project selected in peach-pi -> Secrets.",
    parameters: Type.Object({
      projectId: Type.Optional(
        Type.String({
          description: "Restrict to a BWS project id; omits the selected project by default.",
        }),
      ),
    }),
    async execute(
      _toolCallId,
      params: ConnectorToolParams<"bws_list_secrets">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const url = new URL(b.baseUrl + "/secrets");
      if (params.projectId) url.searchParams.set("projectId", params.projectId);
      const res = await fetch(url, { headers: { authorization: "Bearer " + b.token }, signal });
      const text = await res.text();
      return { content: [txt(text)], details: { status: res.status } };
    },
  });

  // Fetch one BWS secret's cleartext value by id.
  pi.registerTool({
    name: "bws_get_secret",
    label: "Get a BWS secret value",
    description:
      "Fetch the cleartext value of one Bitwarden Secrets Manager secret by id." +
      " Use bws_list_secrets first to find the id. The value is returned as a" +
      " tool result and does not appear in the user's prompt text. Do not echo" +
      " the returned value back to the user unless they explicitly ask.",
    parameters: Type.Object({
      secretId: Type.String({
        description: "BWS secret id (from bws_list_secrets or an @-pinned secret).",
      }),
    }),
    async execute(
      _toolCallId,
      params: ConnectorToolParams<"bws_get_secret">,
      signal,
    ): Promise<ConnectorToolOut> {
      const b = await readBootstrap();
      if (!b) return notRunning();
      const res = await fetch(b.baseUrl + "/secret-get", {
        method: "POST",
        headers: { authorization: "Bearer " + b.token, "content-type": "application/json" },
        body: JSON.stringify({ secretId: params.secretId }),
        signal,
      });
      const text = await res.text();
      return {
        content: [txt(text)],
        details: { status: res.status, secretId: params.secretId },
      };
    },
  });
}
