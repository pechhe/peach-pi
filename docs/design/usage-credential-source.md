# Design: Deepen the usage adapter seam with `CredentialSource`

Issue: #29 (exploration / design — **no implementation here**).

## Problem

`UsageAdapter` (`apps/desktop/electron/services/usage-shared.ts`) is clean:

```ts
export interface UsageAdapter {
  label: string;
  configured(): Promise<boolean>;
  fetch(): Promise<FetchResult>;
  dashboardUrl?(): string;
}
```

But the seam is held together by interface conformance alone, not by a
transport abstraction. Behind it sit **three different credential strategies**,
each implemented *inline inside its adapter*:

| Adapter | File | Credential strategy | Storage |
|---|---|---|---|
| `ZaiAdapter`, `OpenRouterAdapter`, `NeuralWattAdapter` | `usage-adapters.ts` | API key (`!cmd` / `$VAR` / literal) | `~/.pi/agent/models.json` |
| `AnthropicAdapter` | `usage-anthropic-adapter.ts` | OAuth access token + refresh-and-persist | `~/.pi/agent/auth.json` |
| `XiaomiMiMoAdapter` | `usage-mimo-adapter.ts` | none / dashboard-only | reads `models.json` only for `configured()` |

Consequences of the boundary sitting *above* the credential logic:

1. **Credential access is duplicated and private.** `hasApiKey` / `apiKeyFor`
   live in `usage-adapters.ts`; the OAuth refresh-and-persist dance
   (`maybeRefresh`, writing back to `auth.json`) lives inside
   `usage-anthropic-adapter.ts`. A second OAuth provider (Google, GitHub)
   would copy-paste that dance rather than compose it.
2. **A file split exists solely to dodge an import cycle.** `usage-service.ts`
   holds the `ADAPTERS` registry *only* because `usage-anthropic-adapter.ts`
   imports shared helpers from `usage-adapters.ts` (the comment at
   `usage-service.ts:~13` says so). The split encodes an import problem, not a
   design decision.
3. **The registry is hand-maintained** as a literal array in `usage-service.ts`;
   the service both owns the registry *and* orchestrates fetches.
4. **Tests need filesystem mocking of two files** (`models.json` *and*
   `auth.json`) to exercise any single adapter.

The renderer-facing contract (`UsageService.list()/refresh()`,
`ProviderUsageSummary`, `UsageFetchState`) is correct and stays untouched.
Only the seam *behind* `UsageAdapter` is redrawn.

## Decision (summary)

Draw the boundary one level deeper. Introduce a **`CredentialSource`** seam:
the single place that knows *where* a provider's credentials live and *how* to
read/refresh them. Adapters stop touching `models.json` / `auth.json` / `node:fs`
directly; they hold a `CredentialSource` and consume a resolved `Credential`.

A thin **`UsageProvider` composite** owns the fetch + shape logic per provider
and *delegates* credential resolution to its injected source. The service
becomes inert — it only iterates registered providers and calls `provider.run()`.
A dedicated `usage-registry.ts` holds the wiring list, so the service no longer
hand-maintains it.

Full rationale + rejected alternatives: see
[`docs/adr/0011-usage-credential-source-seam.md`](../adr/0011-usage-credential-source-seam.md).

## Proposed interface shapes

### `CredentialSource` + `Credential`

```ts
// usage-shared.ts (or usage-credentials.ts)

/** A resolved credential handed to a provider's fetch logic. */
export type Credential =
  | { kind: "api-key"; value: string; baseUrl?: string }
  | { kind: "oauth"; accessToken: string; refreshToken?: string; expiresAt?: number }
  | { kind: "manual"; note: string }; // dashboard-only — no live credential

/** Knows WHERE a provider's credentials live and HOW to read/refresh them.
 *  The single seam between storage (models.json / auth.json / none) and the
 *  fetch adapters. Adapters never read those files directly. */
export interface CredentialSource {
  /** Provider id, matching models.json / auth.json keys. */
  readonly provider: string;
  /** Credential kind, for diagnostics. */
  readonly kind: "api-key" | "oauth" | "manual";
  /** Cheap probe — no shell exec, no network. Mirrors isConfigValueConfigured(). */
  configured(): Promise<boolean>;
  /** Resolve a usable credential, refreshing tokens / running `!cmd` as needed.
   *  Throws when not configured or resolution fails (same errors as today's
   *  resolveConfigValueOrThrow). `manual` sources return { kind: "manual" }. */
  resolve(): Promise<Credential>;
}
```

### `UsageProvider` (replaces `UsageAdapter`)

```ts
/** One card per provider. Composes a CredentialSource and owns the fetch + the
 *  note/dashboard text. The service only iterates providers and calls run(). */
export interface UsageProvider {
  readonly provider: string;
  readonly label: string;
  /** Credential source this provider reads from (injected, swappable). */
  readonly credential: CredentialSource;
  /** Turn a resolved credential into a usage result. The provider never
   *  touches models.json/auth.json — it consumes `cred`. */
  run(cred: Credential): Promise<FetchResult>;
  /** Dashboard-only link (state "manual"); optional. */
  dashboardUrl?(): string;
}
```

`FetchResult`, `failureNote`, `FETCH_TIMEOUT_MS`, `ProviderUsageSummary`, and
`UsageFetchState` are unchanged — the deepening is entirely behind the adapter.

### Concrete credential sources (new module `usage-credentials.ts`)

- **`ModelsApiKeySource`** — reads `models.json providers.<id>.apiKey` via the
  existing `resolveConfigValue` machinery (`!cmd`/`$VAR`/literal). `configured()`
  uses `isConfigValueConfigured`; `resolve()` uses `resolveConfigValueOrThrow`
  and returns `{ kind: "api-key", value, baseUrl }`. This is what
  `hasApiKey`/`apiKeyFor` already do — promoted into a class.
- **`AnthropicOAuthSource`** — reads/writes `auth.json`, exposes the
  `maybeRefresh`-equivalent: `resolve()` returns the live access token after
  refresh-and-persist (the *only* place OAuth refresh happens). Currently
  scattered inside `usage-anthropic-adapter.ts`.
- **`NullCredentialSource`** — for dashboard-only providers (MiMo today, Kimi or
  similar later). `configured()` may be true (has a key) but `resolve()` returns
  `{ kind: "manual", note }`, so the provider emits `state: "manual"`.

### Registry (replaces the hand-maintained `ADAPTERS` array)

Move the registry to a dedicated `usage-registry.ts` that wires
`{ provider, order, source, provider-factory }` declaratively. The service
imports `registeredProviders()` and is otherwise inert:

```ts
// usage-registry.ts
export const usageProviders: UsageProviderSpec[] = [
  { provider: "anthropic",   order: 0, make: () => new AnthropicUsageProvider() },
  { provider: "zai",         order: 1, make: () => new ZaiUsageProvider() },
  { provider: "xiaomi",      order: 2, make: () => new XiaomiMiMoProvider() },
  { provider: "openrouter",  order: 3, make: () => new OpenRouterUsageProvider() },
  { provider: "neuralwatt",  order: 4, make: () => new NeuralWattUsageProvider() },
];
```

Each provider constructs its own `CredentialSource` internally (so the source
is co-located with the provider that needs it), and the registry only lists
provider factories in display order. This is the recommended
"self-register-via-central-wiring" form; the import-time side-effect
registration alternative is rejected (see ADR alternatives).

## Answering the four design questions

1. **Where does the `CredentialSource` seam sit?** It is a separate collaborator
   *composed by* a thin `UsageProvider` composite — not a free function the
   service zips together, and not a second adapter layer the service reaches
   through. The provider holds the source; the source owns storage. Minimal
   churn vs. today's class-per-provider shape, with a genuine credential
   boundary.
2. **How do adapters self-register?** A single `usage-registry.ts` holds the
   declarative wiring list; the service consumes `usageProviders` and no longer
   hand-maintains an array. "Self-register" here means *the list lives apart
   from the orchestrator*: adding a provider touches only its file + one line
   in the registry, never `usage-service.ts`.
3. **Does the file split dissolve?** Yes. Once credential access moves to
   `usage-credentials.ts` (the only module reading `models.json`/`auth.json`),
   no provider imports from another provider's file → no real cycle. The
   anthropic-vs-HTTP split collapses to "one file per provider" for
   navigability — a real concern, not an import dodge.
4. **Does the manual/dashboard-only adapter stay first-class?** Yes.
   `XiaomiMiMoProvider` stays a first-class `UsageProvider` composing a
   `NullCredentialSource`; its `run()` returns `{ state: "manual", summary: null,
   note }` + sets `dashboardUrl()`. `"manual"` is a legitimate outcome of
   `run()`, already modelled in `UsageFetchState` — not a degenerate adapter.

## Proposed file layout

```
apps/desktop/electron/services/usage/
  usage-shared.ts          # FetchResult, failureNote, FETCH_TIMEOUT_MS, Credential types
  usage-credentials.ts     # CredentialSource + ModelsApiKeySource, AnthropicOAuthSource, NullCredentialSource
  providers/
    anthropic.ts           # AnthropicUsageProvider (delegates OAuth to AnthropicOAuthSource)
    zai.ts
    openrouter.ts
    neuralwatt.ts
    mimo.ts
  usage-registry.ts        # usageProviders[] (the wiring list)
  usage-service.ts         # UsageService consumes usageProviders() — inert except cache + emit
```

## Migration + risk

- **Renderer contract unchanged.** `UsageService.list()/refresh()` and
  `ProviderUsageSummary` shape are untouched → no renderer or IPC changes.
- **OAuth refresh relocation.** `AnthropicAdapter.maybeRefresh` (which writes
  back to `auth.json`) moves into `AnthropicOAuthSource.resolve()` — same
  behavior, single owner, same 5-minute safety margin.
- **API-key adapters** lose their inline `apiKeyFor`/`hasApiKey` calls and read
  `cred.value` from the `Credential` their source resolved. Net code roughly
  equal; the credential path is now testable without filesystem mocking of two
  files.
- **MiMo**'s `hasApiKey` import disappears; it `configured()` via its source.
- **Testability win.** Each provider's `run()` is testable with a fake
  `CredentialSource` returning a canned `Credential` — no real network, no
  `models.json`/`auth.json` stubs. The credential sources are independently
  testable with synthetic files.
- **Behavior preservation.** `configured()` probe stays cheap (no shell exec,
  no network) because the source's `configured()` mirrors
  `isConfigValueConfigured`; `fetch` is only attempted when configured (with the
  existing note-return-on-unsupported path retained).

## Non-goals (deferred to the implementation issue)

- Adding Google / GitHub OAuth providers.
- Changing `ProviderUsageSummary` or the IPC contract.
- Caching strategy changes (the `KeyedAsyncTtl` cache stays as-is).
- Parallelising fetches differently.
