# Design: Move the connector extension to a built asset behind a typed tools contract

Issue: #30. **Exploration only — not implemented.** This document records the
chosen build/load shape and where the contract type lives, to be ratified by
ADR-0011 and built under a follow-up issue.

## Problem

`apps/desktop/electron/services/connector-extension.ts` carries ~220 LOC of
real TypeScript embedded as a string literal (`EXTENSION_SOURCE`, assembled
with array `join` + `+` concatenation to dodge backticks). That string is
written verbatim to `~/.pi/agent/extensions/peach-connectors.ts` and loaded by
pi's strip-types loader. Consequences:

- **Untyped at the embedding site.** The extension body is unreachable by
  `tsc`, the linter, and unit tests. A typo in a tool name, a wrong route
  path, or a drifted fetch signature is invisible until it runs.
- **Hand-mirrored route surface.** The 6 tools (`connectors_search_tools`,
  `connector_execute`, `custom_connections`, `custom_request`,
  `bws_list_secrets`, `bws_get_secret`) must each mirror a route in
  `connector-resolver.ts` by hand. The only drift signal is the `VERSION`
  marker, which only triggers a rewrite — it does not detect a mismatch.
- **Same pattern repeats.** `peach-vision-consent-extension.ts` (and the
  `devtap/extension`) use the identical embed-as-string trick, so the cost
  compounds across every peach-owned extension.

This is ADR-0001-adjacent (packaging / asset loading): the SDK loads
extensions/resources at runtime, and today the extension is injected as a
string for that loader to consume.

## Goals / non-goals

- **Goal:** the extension source becomes a real `.ts` file that `tsc`, the
  linter, and tests can see, while still loading at runtime via the SDK's
  `DefaultResourceLoader`.
- **Goal:** a single typed contract so a tool registration in the extension
  and its resolver route cannot silently drift.
- **Goal:** no regression to the ADR-0001 packaging path (CJS main bundle,
  `asar` unpacking, SDK external + vendored at package time).
- **Non-goal:** rewriting every peach-owned extension in one go. The pattern
  is generalised here; vision-consent / devtap migrate later on the same
  template.
- **Non-goal:** changing the localhost HTTP bridge itself or the bootstrap
  pointer file. That transport stays as-is.

## Where the typed tools contract lives

**`packages/shared-types`.** Concretely a new module
`packages/shared-types/src/connector-tools.ts`, re-exported from `index.ts`:

```ts
import type { Static } from "typebox";
import { Type } from "typebox"; // typebox is already a workspace dep

/** Schema + static type for each peach-connectors tool's parameters. */
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
export type ConnectorToolParams<T extends ConnectorToolName> =
  Static<typeof ConnectorToolSchemas[T]>;

/** The route + method the extension hits for each tool. Resolving the
 *  contract here means the extension and ConnectorResolver are bound to
 *  the same source of truth. */
export const ConnectorToolRoutes = {
  connectors_search_tools: { method: "GET",  path: "/tools" },
  connector_execute:       { method: "POST", path: "/execute" },
  custom_connections:      { method: "GET",  path: "/custom-connections" },
  custom_request:          { method: "POST", path: "/custom-request" },
  bws_list_secrets:        { method: "GET",  path: "/secrets" },
  bws_get_secret:          { method: "POST", path: "/secret-get" },
} as const;

/** Shared result shape the extension's tool bodies use. */
export interface ConnectorToolOut {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}
```

Both the **extension** (built asset) and the **resolver** import from this
module. The resolver's HTTP route table is derived from
`ConnectorToolRoutes` so adding a tool = adding one object entry; the
extension's `registerTool` loop iterates the same map. A route that exists on
one side but not the other is a compile error, not a runtime one.

`shared-types` is the right home (not a new package) because:

- the IPC contract registry already lives there and is the established seam
  between main process and everything else;
- it already depends on `typebox` (the SDK's schema lib); and
- both the resolver (main process) and the extension (built asset) already
  import from `@peach-pi/shared-types` indirectly via the SDK surface, so no
  new dependency edge is introduced.

### What the contract does NOT cover

It binds **shape**, not **behaviour**. The resolver still owns auth, the
bootstrap token, and the Composio/BWS/custom-connection dispatch. The contract
only guarantees that if a tool is registered, its route exists and the param
type matches — which is exactly the drift class the `VERSION` marker failed to
catch.

## Build step

The extension leaves its string-literal embedding and becomes a real source
file under the pi-client build surface:

```
packages/pi-client/src/extensions/peach-connectors.ts   ← real .ts, type-checked
```

It is plain TS (no Svelte, no renderer APIs), imports the contract from
`@peach-pi/shared-types`, and uses pi's strip-types-compatible subset (CJS
dynamic `require` is avoided; top-level `import type` + value `import`s are
fine — the strip-types loader handles them, same as today).

A new build script **copies** this file to a loadable asset:

```
scripts/build-extensions.mjs        ← packs peach-owned extensions into assets
```

Run as part of `pnpm dev` (before launch) and the Forge `packageAfterCopy`
hook (so the vendor step that already runs there also stages extension
assets). The script:

1. Reads each entry from a manifest
   (`packages/pi-client/src/extensions/manifest.json`):
   `{ "peach-connectors": "src/peach-connectors.ts", ... }`.
2. Strips import paths that must resolve at runtime against the SDK
   (`@earendil-works/pi-coding-agent`, `typebox`) — these stay as bare
   specifiers the loader resolves against the vendored SDK (packaged) or the
   workspace `node_modules` (dev). Imports from `@peach-pi/shared-types` are
   **inlined** — the extension runs in the pi loader, which has no
   `@peach-pi/shared-types` resolution, so the contract types must not
   survive as a runtime import. (They are type-only at the extension site:
   schema *values* from typebox are the runtime artefact; the
   `@peach-pi/shared-types` import is erased by `tsc`/strip-types because the
   extension only uses it in type positions.)
3. Writes the staged asset to `apps/desktop/electron/build/extensions/peach-connectors.ts`.

The staging path under `apps/desktop/electron/build/` is deliberate: the
build dir is already inside the packaged app's source tree, so the
extension ships inside the app with no extra `extraResource` entry, and in
dev the installer copies it to `~/.pi/agent/extensions/` exactly as today.

### Why inline the contract rather than load shared-types at runtime

The pi strip-types loader resolves modules against the agent dir + the SDK's
own dependency closure. `@peach-pi/shared-types` is a peach-pi workspace
package, not an SDK dependency, so the loader cannot resolve it. Because the
contract module is **type-only at the extension site** (the runtime values
the extension needs — the typebox schemas — live in `typebox`, which the
SDK already ships), the shared-types import erases cleanly. The extension
therefore consumes the contract as types; the resolver consumes the same
contract as values (schemas + route map). One file, two consumers, zero
runtime coupling to the peach-pi workspace.

## Runtime load path

### Dev

`ensureConnectorExtension()` (in `connector-extension.ts`, now slimmed to an
installer, not a string bag) reads the staged asset from
`apps/desktop/electron/build/extensions/peach-connectors.ts` and writes it to
`~/.pi/agent/extensions/peach-connectors.ts` if missing or if its embedded
version marker differs from the staged one. The `VERSION` marker is kept —
see "Does VERSION survive?" below.

### Packaged

The staged asset lives in the packaged app source tree, so it is available at
the same relative path the dev installer uses (resolved via `__dirname`, per
the ADR-0001 CJS rule). The installer copies it on first launch of a packaged
build. Nothing crosses the `asar` boundary (it is a `.ts` text file, not a
native prebuild), so no `asar.unpack` change is needed.

### SDK discovery

The SDK's `DefaultResourceLoader` (`pi-session.ts` constructs it with
`agentDir: sdk.getAgentDir()`) auto-discovers files under
`~/.pi/agent/extensions/`. The installer writing the staged asset there is all
the SDK needs — same as today. No `DefaultPackageManager` involvement: this is
a local single-file extension, not an npm package.

## Does the `VERSION` marker survive?

**Yes, but its role narrows.** Types now enforce the contract at compile
time, so `VERSION` no longer "detects drift" (drift is a compile error).
It stays as a **runtime reload guard**: it tells the installer whether the
on-disk file is the one this build shipped, so we don't clobber a freshly
loaded copy (or a user's local edit) on every launch. Renamed intent in the
comment, kept in the source.

## Proposed file layout

```
packages/shared-types/src/connector-tools.ts          ← typed contract (NEW)
packages/shared-types/src/index.ts                    ← re-export (EDIT)
packages/pi-client/src/extensions/peach-connectors.ts ← extension source (NEW, real .ts)
packages/pi-client/src/extensions/manifest.json      ← build manifest (NEW)
scripts/build-extensions.mjs                          ← staging build step (NEW)
apps/desktop/electron/services/connector-extension.ts ← slimmed to installer (EDIT)
apps/desktop/forge.config.ts                          ← run build-extensions in packageAfterCopy (EDIT)
```

## Risks / open questions for the ADR

1. **Strip-types + typebox at runtime.** The extension uses `Type.Object(...)`
   as a value. The SDK ships typebox; the loader must resolve it against the
   packaged SDK (`node_modules/@earendil-works/pi-coding-agent`'s
   `typebox`). Verify the built asset keeps `import { Type } from "typebox"`
   as a bare specifier the loader resolves, exactly as the embedded string
   does today. (Today it works because the string already contains this
   import; the asset preserves it.)
2. **Build ordering.** `pnpm dev` must stage the asset before the Electron
   main process calls `ensureConnectorExtension()`. A prelaunch script or a
   `predev` hook handles it; the Forge hook already covers the packaged
   path.
3. **Migration of sibling extensions.** `peach-vision-consent-extension.ts`
   and `devtap/extension` use the same embed trick. They migrate on the same
   template but are explicitly out of scope for the follow-up issue.

## Acceptance mapping

- Design doc (this file) describes build step + runtime load path. ✅
- Contract type shape sketched above (shared between resolver + extension). ✅
- ADR-0011 drafted covering the decision, ADR-0001 interaction, rejected
  alternatives. ✅ (separate file)
- Follow-up implementation issue filed referencing this design. ✅ (gh issue)
