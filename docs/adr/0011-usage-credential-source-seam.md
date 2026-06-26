# ADR-0011: Usage credential source seam

Status: Proposed (2026-06-26) — design only; implementation tracked in a
follow-up issue.

## Context

The usage feature (`apps/desktop/electron/services/usage-*.ts`) renders one
card per provider (Anthropic, Z.ai, OpenRouter, NeuralWatt, Xiaomi MiMo) into a
`ProviderUsageSummary`. The renderer-facing seam `UsageAdapter` is clean:

```ts
export interface UsageAdapter {
  label: string;
  configured(): Promise<boolean>;
  fetch(): Promise<FetchResult>;
  dashboardUrl?(): string;
}
```

But the boundary sits *above* the credential logic, so behind a single interface
sit three different auth strategies, each implemented inline:

- API-key adapters (`ZaiAdapter`, `OpenRouterAdapter`, `NeuralWattAdapter` in
  `usage-adapters.ts`) read `~/.pi/agent/models.json` via `hasApiKey` /
  `apiKeyFor` (`resolve-config-value.ts` resolves `!cmd` / `$VAR` / literal).
- One OAuth adapter (`AnthropicAdapter` in `usage-anthropic-adapter.ts`) reads
  `~/.pi/agent/auth.json` and runs its own refresh-and-persist dance
  (`maybeRefresh`, writing back to `auth.json`).
- One manual/dashboard-only adapter (`XiaomiMiMoAdapter`) returns
  `state: "manual"`.

Three smells follow from the misplaced boundary:

1. **Credential access is duplicated and private.** A second OAuth provider
   (Google, GitHub) would copy-paste Anthropic's refresh-and-persist dance
   rather than compose a shared credential concern.
2. **A file split exists only to dodge an import cycle.** The `ADAPTERS`
   registry lives in `usage-service.ts` (not `usage-adapters.ts`) because
   `usage-anthropic-adapter.ts` imports helpers from `usage-adapters.ts` — the
   comment at `usage-service.ts:~13` admits this. The split encodes an import
   problem, not a design decision.
3. **The registry is hand-maintained** in the same file that orchestrates
   fetches, and tests need filesystem mocking of two files to exercise any
   single adapter.

The renderer / IPC contract (`UsageService.list()/refresh()`,
`ProviderUsageSummary`, `UsageFetchState`) is correct and unchanged; only the
seam *behind* `UsageAdapter` is redrawn.

## Decision

Draw the boundary one level deeper by introducing a **`CredentialSource`** seam,
and reshape the per-provider unit into a thin **`UsageProvider` composite** that
delegates credential resolution to an injected source.

```ts
export type Credential =
  | { kind: "api-key"; value: string; baseUrl?: string }
  | { kind: "oauth"; accessToken: string; refreshToken?: string; expiresAt?: number }
  | { kind: "manual"; note: string };

export interface CredentialSource {
  readonly provider: string;
  readonly kind: "api-key" | "oauth" | "manual";
  configured(): Promise<boolean>;   // cheap probe — no shell exec, no network
  resolve(): Promise<Credential>;  // refresh/execute as needed; throws on failure
}

export interface UsageProvider {
  readonly provider: string;
  readonly label: string;
  readonly credential: CredentialSource;
  run(cred: Credential): Promise<FetchResult>;
  dashboardUrl?(): string;
}
```

The service becomes inert: it iterates registered providers, asks
`provider.credential.configured()`, calls `provider.credential.resolve()`, then
`provider.run(cred)` — mirroring today's probe-then-fetch flow exactly. A
dedicated `usage-registry.ts` declares the wiring list; `usage-service.ts`
consumes `usageProviders` and no longer hand-maintains an array.

Concrete credential sources live in one module (`usage-credentials.ts`):
`ModelsApiKeySource` (the existing `hasApiKey`/`apiKeyFor` promoted to a class),
`AnthropicOAuthSource` (the `maybeRefresh` dance relocated, single owner of
`auth.json` writes), and `NullCredentialSource` (dashboard-only). Adapters never
read `models.json` / `auth.json` / `node:fs` directly.

### Why this shape

- **Class-per-provider preserved** → minimal churn vs. today; each provider
  keeps its fetch logic, its `label`, and its note/dashboard text.
- **Credential seam is genuine** → providers depend on a `Credential`, not on
  files; a new OAuth provider composes a `*OAuthSource` instead of reinventing
  refresh.
- **Manual stays first-class** → `XiaomiMiMoProvider` returns
  `{ state: "manual" }` from `run()`; `"manual"` is a legitimate
  `UsageFetchState`, not a degenerate adapter.
- **Testability** → `run()` is testable with a fake `CredentialSource` returning
  a canned `Credential`; sources are tested with synthetic files independently.

The renderer / IPC contract is untouched.

## Consequences

- `usage-anthropic-adapter.ts` and the HTTP adapters in `usage-adapters.ts`
  merge into a `providers/` directory (one file per provider); the
  import-dodge split dissolves because no provider imports another provider's
  file once credential access moves to `usage-credentials.ts`.
- `hasApiKey` / `apiKeyFor` are removed from `usage-adapters.ts`; their
  equivalents live on `ModelsApiKeySource`. `usage-mimo-adapter.ts`'s
  `hasApiKey` import disappears.
- The `ADAPTERS` array leaves `usage-service.ts`; the service holds only the
  `KeyedAsyncTtl` cache and the `event:usageChanged` emit.
- New per-provider unit tests cover `run()` with fake sources; the existing
  shared-types / format helpers are reused verbatim.
- No renderer, IPC, or `ProviderUsageSummary` changes.

## Rejected alternatives

1. **Keep `UsageAdapter` as-is; overlay a credential helper module only.** Keeps
   one interface but leaves `fetch()` doing credential access internally, so
   the seam is still "interface conformance alone" and the cycle persists.
   Rejected: it does not actually redraw the boundary.

2. **Service zips `source` + `adapter` (two separate lists).** The service would
   pair each provider's `CredentialSource` with a **free-function**
   `fetch(cred): FetchResult` at call time. Rejected: it destroys the
   class-per-provider shape, scatters `label`/`note`/`dashboardUrl` across two
   places, and makes the wiring *less* local. Composition belongs in the
   provider, not in a third wiring-of-the-moment in the service.

3. **Import-time side-effect registration** (each adapter module calls
   `registerUsageAdapter(...)` at import side effect, ordered by a numeric
   field). Rejected for this codebase: the magic of import-order ordering and
   "did this module get imported?" is not worth avoiding one explicit line per
   provider in a registry file. A declarative `usage-registry.ts` is equally
   "self-registering" (the service no longer owns the list) without the
   footgun. Revisit only if providers become externally contributed plugins.

4. **Fold credentials into a generic `OAuthTokenFileSource<provider>` and
   `ApiKeySource<provider>` only, no per-provider source classes.** Viable for
   the API-key path (it IS `ModelsApiKeySource(providerId)`) but the OAuth path
   (refresh URL, client id, 5-min margin, auth.json write-back) is provider-
   specific enough to deserve `AnthropicOAuthSource`; a fully generic OAuth
   source would hide Anthropic-specific decisions. Rejected in its fully-
   generic form; a generic `OAuthTokenFileSource` may be extracted *later* if a
   second OAuth provider materialises and the patterns converge.

5. **Treat manual/dashboard-only as a degenerate case (no `UsageProvider`,
   just a `dashboardUrl` entry in the registry).** Rejected: it bakes
   `state: "manual"` knowledge into the service/registry and removes the clean
   place for MiMo's note text ("Token Plan quota isn't readable via the API
   key…"). Keeping it a first-class `UsageProvider` means a provider that
   gains an API later swaps only its `run()` body.

## Follow-up

Implementation is tracked in a separate issue (filed alongside this design).
It must preserve the renderer/IPC contract verbatim and land per-provider
`run()` unit tests with fake credential sources.
