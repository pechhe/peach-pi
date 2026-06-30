// AUTO-INSTALLED by peach-pi. Staged from
// packages/pi-client/src/extensions/peach-secrets.ts by scripts/build-extensions.mjs.
// peach-secrets v001
//
// This is a real, type-checked TypeScript source file. It talks back to
// peach-pi's BwsResolver over localhost, which proxies to Bitwarden Secrets
// Manager. Secret values never leave the main process — the extension only
// sees names/ids and the fetched value as a tool result.
//
// The `@peach-pi/shared-types` import below is type-only: the contract types
// bind this extension's tool names + param shapes to the BwsResolver's route
// table (single source of truth, `SecretToolRoutes`), but the import is erased
// by strip-types at runtime. Runtime schema values come from `typebox`.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SecretToolName, SecretToolParams, SecretToolOut } from "@peach-pi/shared-types";

const BOOTSTRAP = join(homedir(), ".pi", "agent", "peach-secrets.json");

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

function notRunning(): SecretToolOut {
  return {
    content: [txt("peach-pi is not running. Start the peach-pi app, then retry.")],
    details: {},
  };
}

/**
 * Compile-time link to the contract: fails to type-check unless the registered
 * tools exactly match `SecretToolName` (the keys of `SecretToolRoutes`).
 */
const REGISTERED_TOOL_NAMES = ["bws_list_secrets", "bws_get_secret"] as const;

type _ExhaustiveTools = (typeof REGISTERED_TOOL_NAMES)[number] extends SecretToolName
  ? SecretToolName extends (typeof REGISTERED_TOOL_NAMES)[number]
    ? true
    : never
  : never;

export default function (pi: ExtensionAPI): void {
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
      params: SecretToolParams<"bws_list_secrets">,
      signal,
    ): Promise<SecretToolOut> {
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
      params: SecretToolParams<"bws_get_secret">,
      signal,
    ): Promise<SecretToolOut> {
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
