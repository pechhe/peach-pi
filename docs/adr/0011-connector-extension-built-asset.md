# ADR-0011: Connector extension as a built asset behind a typed tools contract

Status: Proposed (2026-06-26)

Relates to: #30, ADR-0001.

## Context

`apps/desktop/electron/services/connector-extension.ts` ships ~220 LOC of
TypeScript embedded as a **string literal** (`EXTENSION_SOURCE`, array-joined
with `+` to avoid backticks). That string is written verbatim to
`~/.pi/agent/extensions/peach-connectors.ts` and loaded by pi's strip-types
loader. The six tools it registers
(`connectors_search_tools`, `connector_execute`, `custom_connections`,
`custom_request`, `bws_list_secrets`, `bws_get_secret`) must each mirror a
route in `connector-resolver.ts` by hand; the only drift signal is a
`VERSION = "006"` marker that triggers a rewrite but **cannot detect a
mismatch**. The embedded code is unreachable by `tsc`, the linter, and unit
tests — a bug in the extension is invisible until runtime.

This is ADR-0001-adjacent: the SDK loads extensions/resources at runtime, and
today the extension is injected as a string for that loader to consume. The
same embed trick repeats in `peach-vision-consent-extension.ts` and
`devtap/extension`, so the cost compounds.

## Decision

1. **Move the extension to a real, type-checked `.ts` source file** at
   `packages/pi-client/src/extensions/peach-connectors.ts`. It imports the
   SDK + `typebox` (bare specifiers the loader resolves at runtime) and a
   typed contract from `@peach-pi/shared-types` (type-only, erased by
   strip-types).

2. **Add a typed tools contract** in
   `packages/shared-types/src/connector-tools.ts`, re-exported from the
   package barrel. It holds the typebox param schemas, the static param
   types, and the route map (`method` + `path`) for each tool. Both the
   extension and `ConnectorResolver` import from it; the resolver's route
   table is derived from the map, so a tool registered on one side but not
   the other is a compile error.

3. **Add a staging build step** (`scripts/build-extensions.mjs`, driven by a
   manifest) that copies/erases the extension source into a loadable asset
   at `apps/desktop/electron/build/extensions/peach-connectors.ts`. It runs
   in `pnpm predev` (dev) and in the Forge `packageAfterCopy` hook
   (packaged), alongside `vendorPiSdk`.

4. **Slim `connector-extension.ts` to an installer.** It reads the staged
   asset and writes it to `~/.pi/agent/extensions/peach-connectors.ts` if
   missing or if the embedded `VERSION` marker differs. The string literal
   is deleted.

5. **Keep `VERSION` as a runtime reload guard**, not a drift detector.
   Types now enforce the contract; `VERSION` only says "is the on-disk file
   the one this build shipped?" so we don't clobber a freshly loaded copy (or
   a user's local edit) on every launch.

### Why `shared-types` is the contract home

- the typed IPC contract registry already lives there — it is the
  established seam between the main process and everything that talks to it;
- it already depends on `typebox` (the SDK's schema lib); and
- the extension consumes the contract in **type positions only** (runtime
  schema values live in `typebox`, which the SDK ships), so the
  `@peach-pi/shared-types` import erases cleanly under strip-types and adds
  no runtime coupling to the peach-pi workspace.

## ADR-0001 packaging interaction

ADR-0001 keeps the pi SDK external to the Vite CJS main bundle and vendors its
dependency closure in the `packageAfterCopy` hook. This design **adds to**
that path, it does not disturbe it:

- The staged extension asset is a `.ts` text file inside the packaged app
  source tree, so no new `extraResource` or `asar.unpack` entry is needed
  (text files load fine from inside the asar; the loader reads them with
  `readFile`).
- The build script runs in the same `packageAfterCopy` hook as
  `vendorPiSdk`, so the asset is staged before the app is packed.
- The installer in the main process resolves the staged asset via
  `__dirname` — the ADR-0001 CJS rule (never `import.meta.dirname`, which
  compiles to `void 0` silently in the CJS bundle).
- The strip-types loader resolves `typebox` and
  `@earendil-works/pi-coding-agent` against the vendored SDK in
  `node_modules/.../@earendil-works/pi-coding-agent`, exactly as the
  embedded string does today; the built asset keeps these as bare
  specifiers, so resolution behaviour is unchanged.

## Rejected alternatives

### A. Keep the string literal, add a generated type mirror

Generate a `.d.ts` from the embedded string at build time so `tsc` sees it.
**Rejected:** two artifacts must stay in sync (the string and the generated
declaration); the whole point is to stop hand-mirroring. The type mirror is
also silent on the resolver route side, so route drift is still undetectable.

### B. Compile the extension to JS and load the compiled module

Ship a `.js`/`.mjs` instead of a `.ts` strip-types source.
**Rejected:** the SDK's loader is built around strip-types `.ts` files (the
whole `~/.pi/agent/extensions/` convention assumes it), and shipping a
precompiled module introduces a CJS/ESM interop edge that the strip-types
path deliberately avoids. No benefit over staging the `.ts` source.

### C. Put the contract in a new `pi-client-shared` package

A lighter package than `shared-types`, holding only the tools contract.
**Rejected:** adds a package for one file. `shared-types` already carries
the IPC contract + typebox dep and is already imported (indirectly) by both
consumers. New package = new boundary, new build edge, no payoff at this
size.

### D. Load the contract at runtime via the SDK loader

Keep `@peach-pi/shared-types` as a runtime import resolved by the loader.
**Rejected:** the strip-types loader resolves modules against the agent dir
+ the SDK's own dependency closure; `@peach-pi/shared-types` is a peach-pi
workspace package not in that closure, so the loader cannot resolve it.
Inlining (erasing) the type-only import is the only option that keeps the
contract in shared-types without teaching the loader about the workspace.

### E. Run the extension in-process instead of via the localhost bridge

Drop the HTTP bridge; have the SDK call the main process directly.
**Rejected:** out of scope and changes the security model (the Composio API
key stays in the main process precisely because the extension talks over
localhost, not because it shares the process). The bridge is correct; only
the source-loading mechanism is wrong.

## Consequences

- The extension body is type-checked, lintable, and unit-testable like any
  other `packages/pi-client` source.
- A tool registered in the extension without a matching route (or vice
  versa) is a compile error against `ConnectorToolRoutes`, not a runtime
  silence.
- `connector-extension.ts` shrinks from ~220 LOC (mostly string) to a small
  installer; the `EXTENSION_SOURCE` bag is deleted.
- The pattern generalises: `peach-vision-consent-extension.ts` and
  `devtap/extension` migrate on the same template in later issues.
- One new build step (`scripts/build-extensions.mjs`) runs in dev + packaging;
  a manifest lists which peach-owned extensions to stage.

## Follow-up

Implementation is deferred to a separate issue (filed under #30). This ADR
records the decision only; no code changes ship with it.
