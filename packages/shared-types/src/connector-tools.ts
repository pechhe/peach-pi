/**
 * Typed tools contract shared between the `peach-connectors` pi extension
 * (a built asset loaded by pi's strip-types loader) and peach-pi's
 * `ConnectorResolver` (the localhost HTTP bridge in the main process).
 *
 * The extension consumes this module in **type positions only** (it imports
 * `ConnectorToolName`, `ConnectorToolParams`, `ConnectorToolOut`); the
 * `@peach-pi/shared-types` import is therefore erased by strip-types at
 * runtime, and the extension's runtime schema values come from `typebox`
 * (which the SDK ships). The resolver consumes `ConnectorToolRoutes` as a
 * runtime value to derive its route table.
 *
 * Adding a tool = adding one entry to both `ConnectorToolSchemas` and
 * `ConnectorToolRoutes`. A tool registered on one side but not the other is a
 * compile error against `ConnectorToolName` (extension) / `ConnectorToolRoutes`
 * (resolver), not a runtime silence.
 */
import type { Static } from "typebox";
import { Type } from "typebox";

/** typebox param schema for each peach-connectors tool. */
export const ConnectorToolSchemas = {
  connectors_search_tools: Type.Object({
    query: Type.Optional(Type.String()),
    toolkits: Type.Optional(Type.Array(Type.String())),
  }),
  connector_execute: Type.Object({
    toolSlug: Type.String(),
    arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
  custom_connections: Type.Object({}),
  custom_request: Type.Object({
    connection: Type.String(),
    method: Type.Optional(Type.String()),
    path: Type.String(),
    body: Type.Optional(Type.Unknown()),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  bws_list_secrets: Type.Object({
    projectId: Type.Optional(Type.String()),
  }),
  bws_get_secret: Type.Object({
    secretId: Type.String(),
  }),
} as const;

export type ConnectorToolName = keyof typeof ConnectorToolSchemas;

/** Static param type the extension's `execute` receives for tool `T`. */
export type ConnectorToolParams<T extends ConnectorToolName> =
  Static<typeof ConnectorToolSchemas[T]>;

/**
 * The HTTP method + path the extension hits for each tool. The resolver's
 * route table is derived from this map, so the resolver and the extension are
 * bound to one source of truth.
 */
export const ConnectorToolRoutes = {
  connectors_search_tools: { method: "GET", path: "/tools" },
  connector_execute: { method: "POST", path: "/execute" },
  custom_connections: { method: "GET", path: "/custom-connections" },
  custom_request: { method: "POST", path: "/custom-request" },
  bws_list_secrets: { method: "GET", path: "/secrets" },
  bws_get_secret: { method: "POST", path: "/secret-get" },
} as const;

/** Shared result shape the extension's tool bodies return. */
export interface ConnectorToolOut {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}
