/**
 * Typed tools contract shared between the `peach-secrets` pi extension (a built
 * asset loaded by pi's strip-types loader) and peach-pi's `BwsResolver` (the
 * localhost HTTP bridge in the main process).
 *
 * The extension consumes this module in **type positions only** (it imports
 * `SecretToolName`, `SecretToolParams`, `SecretToolOut`); the
 * `@peach-pi/shared-types` import is erased by strip-types at runtime, and the
 * extension's runtime schema values come from `typebox`. The resolver consumes
 * `SecretToolRoutes` as a runtime value to derive its route table.
 *
 * Adding a tool = adding one entry to both `SecretToolSchemas` and
 * `SecretToolRoutes`; a mismatch is a compile error, not a runtime silence.
 */
import type { Static } from "typebox";
import { Type } from "typebox";

/** typebox param schema for each peach-secrets tool. */
export const SecretToolSchemas = {
  bws_list_secrets: Type.Object({
    projectId: Type.Optional(Type.String()),
  }),
  bws_get_secret: Type.Object({
    secretId: Type.String(),
  }),
} as const;

export type SecretToolName = keyof typeof SecretToolSchemas;

/** Static param type the extension's `execute` receives for tool `T`. */
export type SecretToolParams<T extends SecretToolName> = Static<(typeof SecretToolSchemas)[T]>;

/** The HTTP method + path the extension hits for each tool; the resolver's
 *  route table is derived from this map (single source of truth). */
export const SecretToolRoutes = {
  bws_list_secrets: { method: "GET", path: "/secrets" },
  bws_get_secret: { method: "POST", path: "/secret-get" },
} as const;

/** Shared result shape the extension's tool bodies return. */
export interface SecretToolOut {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}
