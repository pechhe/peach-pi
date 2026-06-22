<script lang="ts">
  import { onMount } from "svelte";
  import type {
    Connector,
    CreateApiKeyInput,
    CreateOAuthInput,
    OAuthPreset,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import Plug from "@lucide/svelte/icons/plug";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { Select } from "../components/ui/select";
  import ConnectorIcon from "./ConnectorIcon.svelte";

  // BYO model: user supplies their own OAuth client (id + secret). peach-pi
  // bundles no secrets; presets only pre-fill the endpoints + flags.
  let connectors = $state<Connector[]>([]);
  let presets = $state<OAuthPreset[]>([]);
  let mode = $state<"list" | "catalog" | "apikey" | "oauth">("list");
  let busyId = $state<string | null>(null);
  let error = $state("");

  // ── API-key form ──
  let akProvider = $state("");
  let akLabel = $state("");
  let akKey = $state("");

  // ── OAuth form ──
  let oaProvider = $state("");
  let oaPreset = $state<OAuthPreset | null>(null);
  let oaLabel = $state("");
  let oaClientId = $state("");
  let oaClientSecret = $state("");
  let oaRedirectUri = $state("");
  let oaAuthorizeUrl = $state("");
  let oaTokenUrl = $state("");
  let oaScopes = $state(""); // space/comma-separated
  let oaUsePkce = $state(true);
  let oaUseBasicAuth = $state(false);

  function parseScopes(s: string): string[] {
    return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  }

  async function load() {
    [connectors, presets] = await Promise.all([
      api.invoke("connectors:list"),
      api.invoke("connectors:presets"),
    ]);
  }

  onMount(() => {
    void load();
    return api.on("event:connectorsChanged", () => void load());
  });

  function applyPreset(name: string) {
    const p = presets.find((x) => x.provider === name) ?? null;
    oaPreset = p;
    if (p) {
      oaRedirectUri = p.redirectUri;
      oaAuthorizeUrl = p.authorizeUrl;
      oaTokenUrl = p.tokenUrl;
      oaScopes = p.scopes.join(", ");
      oaUsePkce = p.usePkce;
      oaUseBasicAuth = p.useBasicAuth;
    }
  }

  // Catalog tile → prefill the whole OAuth form and jump to it. Only client
  // credentials are left for the user (BYO).
  function pickCatalog(p: OAuthPreset) {
    applyPreset(p.provider);
    oaProvider = p.provider;
    oaLabel = p.label;
    oaClientId = p.clientId ?? "";
    oaClientSecret = "";
    error = "";
    mode = "oauth";
  }

  // Open the browser for an OAuth handshake, then drop back to the list. The
  // deep-link/loopback callback finishes the exchange out-of-band.
  let connecting = $state<string | null>(null);
  async function launchAuth(start: () => Promise<{ authUrl: string }>, provider: string) {
    error = "";
    connecting = provider;
    try {
      const { authUrl } = await start();
      window.open(authUrl, "_blank", "noopener");
      mode = "list";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      connecting = null;
    }
  }

  // The saved OAuth connector for a provider, if one exists.
  function connectorFor(provider: string): Connector | null {
    return connectors.find((c) => c.provider === provider && c.authKind === "oauth") ?? null;
  }

  // Catalog tile click. Three tiers, most-specific first:
  //  1. A connector already exists → re-auth one-click (creds live in Keychain).
  //  2. A client is provisioned (bundled or local file) → connect one-click.
  //  3. Nothing yet → open the BYO form so the user can set it up once.
  function openProvider(p: OAuthPreset) {
    const existing = connectorFor(p.provider);
    if (existing) return void launchAuth(() => api.invoke("connectors:startOAuth", existing.id), p.provider);
    if (p.hasClient) return void launchAuth(() => api.invoke("connectors:connectCatalog", p.provider), p.provider);
    pickCatalog(p);
  }

  // Icon slug for a saved connector row (matched back to its catalog entry).
  function slugFor(provider: string): string | null {
    return presets.find((p) => p.provider === provider)?.icon ?? null;
  }

  async function saveApiKey() {
    error = "";
    if (!akProvider.trim() || !akLabel.trim() || !akKey.trim()) {
      error = "Provider, label, and API key are required.";
      return;
    }
    const input: CreateApiKeyInput = {
      provider: akProvider.trim(),
      label: akLabel.trim(),
      apiKey: akKey.trim(),
    };
    await api.invoke("connectors:createApiKey", input);
    resetForms();
  }

  async function saveOAuth() {
    error = "";
    // client_id is always required. client_secret is required only for
    // confidential clients; PKCE public clients authenticate via the verifier.
    if (!oaProvider.trim() || !oaClientId.trim()) {
      error = "Provider and client ID are required.";
      return;
    }
    if (!oaUsePkce && !oaClientSecret.trim()) {
      error = "Client secret is required when PKCE is off.";
      return;
    }
    const input: CreateOAuthInput = {
      provider: oaProvider.trim(),
      label: oaLabel.trim() || oaProvider.trim(),
      clientId: oaClientId.trim(),
      clientSecret: oaClientSecret.trim() || undefined,
      redirectUri: oaRedirectUri.trim(),
      authorizeUrl: oaAuthorizeUrl.trim(),
      tokenUrl: oaTokenUrl.trim(),
      scopes: parseScopes(oaScopes),
      usePkce: oaUsePkce,
      useBasicAuth: oaUseBasicAuth,
    };
    const created = await api.invoke("connectors:createOAuth", input);
    // Kick off the auth flow immediately — renderer opens the URL in the
    // browser; the callback arrives via the deep-link scheme or loopback.
    const { authUrl } = await api.invoke("connectors:startOAuth", created.id);
    window.open(authUrl, "_blank", "noopener");
    resetForms();
  }

  async function connect(row: Connector) {
    busyId = row.id;
    error = "";
    try {
      const { authUrl } = await api.invoke("connectors:startOAuth", row.id);
      window.open(authUrl, "_blank", "noopener");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busyId = null;
    }
  }

  async function refresh(row: Connector) {
    busyId = row.id;
    error = "";
    try {
      await api.invoke("connectors:refresh", row.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busyId = null;
    }
  }

  async function revoke(row: Connector) {
    await api.invoke("connectors:revoke", row.id);
  }

  function resetForms() {
    mode = "list";
    akProvider = "";
    akLabel = "";
    akKey = "";
    oaProvider = "";
    oaLabel = "";
    oaClientId = "";
    oaClientSecret = "";
    oaRedirectUri = "";
    oaAuthorizeUrl = "";
    oaTokenUrl = "";
    oaScopes = "";
    oaUsePkce = true;
    oaUseBasicAuth = false;
    oaPreset = null;
  }

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  function statusText(c: Connector): string {
    if (c.authKind === "api_key") return "API key";
    if (!c.connected) return "Not connected";
    if (c.expiresAt && Date.parse(c.expiresAt) <= Date.now()) return "Expired";
    return "Connected";
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="connections-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="flex items-center gap-2 text-sm font-medium text-fg-soft">
      <Plug size={15} /> Connections
    </h1>
    {#if mode === "list"}
      <button
        class="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-fg"
        onclick={() => {
          playButtonClick();
          mode = "catalog";
        }}
      >
        + Add
      </button>
    {:else}
      <button
        class="rounded-lg px-3 py-1 text-sm text-muted hover:text-fg"
        onclick={() => { mode = mode === "oauth" ? "catalog" : "list"; error = ""; }}
      >← Back</button>
    {/if}
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-2xl flex-col gap-3">
      {#if error}
        <p class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      {/if}

      {#if mode === "list"}
        {#if connectors.length === 0}
          <div class="rounded-lg border border-border-strong bg-surface p-6 text-center">
            <p class="text-sm text-muted">No saved connections yet.</p>
            <p class="mt-1 text-xs text-fainter">
              Add a Notion PAT, GitHub PAT, or OAuth connector to give your agents access to
              external services.
            </p>
          </div>
        {:else}
          {#each connectors as c (c.id)}
            <div
              class="flex items-center justify-between rounded-lg border border-border-strong bg-surface p-4"
              data-testid={`connector-${c.provider}`}
            >
              <div class="flex min-w-0 items-center gap-3">
                <ConnectorIcon slug={slugFor(c.provider)} label={c.label} size={22} />
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-fg">{c.label}</span>
                    <span class="rounded bg-bg px-1.5 py-0.5 text-[11px] uppercase text-muted">
                      {c.provider}
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs text-fainter">
                    {statusText(c)} · expires {fmt(c.expiresAt)}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                {#if c.authKind === "oauth" && !c.connected}
                  <button
                    class="rounded-md px-2 py-1 text-xs text-muted hover:bg-bg hover:text-fg"
                    onclick={() => connect(c)}
                    disabled={busyId === c.id}
                  >Connect</button>
                {/if}
                {#if c.authKind === "oauth" && c.connected}
                  <button
                    class="rounded-md px-2 py-1 text-muted hover:bg-bg hover:text-fg"
                    onclick={() => refresh(c)}
                    disabled={busyId === c.id}
                    title="Refresh token"
                  ><RefreshCw size={14} /></button>
                {/if}
                <button
                  class="rounded-md px-2 py-1 text-muted hover:bg-bg hover:text-red-400"
                  onclick={() => revoke(c)}
                  title="Revoke & delete"
                ><Trash2 size={14} /></button>
              </div>
            </div>
          {/each}
        {/if}

        <div class="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-4">
          <p class="text-sm font-medium text-fg-soft">Add a connection</p>
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm hover:border-border-focus"
              onclick={() => { mode = "catalog"; }}
            >Browse catalog…</button>
            <button
              class="flex-1 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm hover:border-border-focus"
              onclick={() => { mode = "apikey"; }}
            >API key / PAT…</button>
          </div>
        </div>
      {:else if mode === "catalog"}
        <p class="text-sm text-fainter">
          Pick a service to connect. Configured ones open the provider's sign-in
          page directly — approve access and you're done. “Needs setup” means no
          OAuth client is provisioned yet; use the form to add one.
        </p>
        <div class="grid grid-cols-2 gap-2" data-testid="connector-catalog">
          {#each presets as p (p.provider)}
            {@const existing = connectorFor(p.provider)}
            <button
              class="flex items-center gap-3 rounded-lg border border-border-strong bg-surface p-3 text-left hover:border-border-focus disabled:opacity-50"
              onclick={() => openProvider(p)}
              disabled={connecting === p.provider}
              data-testid={`catalog-${p.provider}`}
            >
              <ConnectorIcon slug={p.icon ?? null} hex={p.iconHex ?? null} label={p.label} size={24} />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm text-fg">{p.label}</span>
                {#if existing?.connected}
                  <span class="text-[11px] text-accent">connected</span>
                {:else if existing}
                  <span class="text-[11px] text-fainter">reconnect</span>
                {:else if !p.hasClient}
                  <span class="text-[11px] text-fainter">needs setup</span>
                {/if}
              </span>
              {#if connecting === p.provider}
                <span class="text-[11px] text-muted">…</span>
              {/if}
            </button>
          {/each}
          <button
            class="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-bg p-3 text-left hover:border-border-focus"
            onclick={() => { applyPreset(""); oaPreset = null; oaProvider = ""; oaLabel = ""; oaClientId = ""; oaClientSecret = ""; oaRedirectUri = ""; oaAuthorizeUrl = ""; oaTokenUrl = ""; oaScopes = ""; oaUsePkce = true; oaUseBasicAuth = false; mode = "oauth"; }}
            data-testid="catalog-custom"
          >
            <Plus size={20} />
            <span class="text-sm text-muted">Custom…</span>
          </button>
        </div>
        <button
          class="self-start rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm hover:border-border-focus"
          onclick={() => { mode = "apikey"; }}
        >Use an API key / PAT instead…</button>
      {:else if mode === "apikey"}
        <div class="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface p-4" data-testid="apikey-form">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="ak-provider">Provider</label>
            <input
              id="ak-provider"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              placeholder="notion / github / linear"
              bind:value={akProvider}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="ak-label">Label</label>
            <input
              id="ak-label"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              placeholder="Personal Notion"
              bind:value={akLabel}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="ak-key">API key / token</label>
            <input
              id="ak-key"
              type="password"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm outline-none focus:border-border-focus"
              placeholder="secret_••••"
              bind:value={akKey}
            />
            <p class="text-[11px] text-fainter">Stored encrypted via macOS Keychain. Never sent to the renderer except at resolution time.</p>
          </div>
          <div class="flex justify-end gap-2">
            <button class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={resetForms}>Cancel</button>
            <button class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg" onclick={saveApiKey}>Save</button>
          </div>
        </div>
      {:else if mode === "oauth"}
        <div class="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface p-4" data-testid="oauth-form">
          <div class="flex items-start justify-between gap-3">
            <p class="text-xs text-fainter">
              Bring your own OAuth client — register one with the provider and paste the
              credentials here. peach-pi bundles no secrets.
            </p>
            {#if oaPreset?.docsUrl}
              <a
                class="flex shrink-0 items-center gap-1 text-xs text-accent hover:underline"
                href={oaPreset.docsUrl}
                target="_blank"
                rel="noopener"
              ><ExternalLink size={12} /> Get credentials</a>
            {/if}
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-preset">Provider preset</label>
            <Select
              id="oa-preset"
              value={oaPreset?.provider ?? ""}
              placeholder="Custom…"
              items={presets.map((p) => ({ value: p.provider, label: p.label }))}
              onValueChange={applyPreset}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-provider">Provider id</label>
            <input
              id="oa-provider"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              placeholder="notion"
              bind:value={oaProvider}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-label">Label</label>
            <input
              id="oa-label"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              placeholder="My Notion workspace"
              bind:value={oaLabel}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-clientid">Client ID</label>
            <input
              id="oa-clientid"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm outline-none focus:border-border-focus"
              bind:value={oaClientId}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-secret">
              Client secret <span class="text-fainter">(leave blank for PKCE public clients)</span>
            </label>
            <input
              id="oa-secret"
              type="password"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm outline-none focus:border-border-focus"
              bind:value={oaClientSecret}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-redirect">Redirect URI</label>
            <input
              id="oa-redirect"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm outline-none focus:border-border-focus"
              bind:value={oaRedirectUri}
            />
            <p class="text-[11px] text-fainter">
              Custom scheme (<code>peachpi://oauth/callback</code>) for providers that
              accept it; <code>http://localhost:PORT/callback</code> for ones that don't
              (e.g. Notion).
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-muted" for="oa-auth">Authorize URL</label>
              <input
                id="oa-auth"
                class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-border-focus"
                bind:value={oaAuthorizeUrl}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-muted" for="oa-token">Token URL</label>
              <input
                id="oa-token"
                class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-border-focus"
                bind:value={oaTokenUrl}
              />
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted" for="oa-scopes">Scopes (comma/space)</label>
            <input
              id="oa-scopes"
              class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-border-focus"
              placeholder="read, write"
              bind:value={oaScopes}
            />
          </div>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" bind:checked={oaUsePkce} /> Use PKCE (S256)
            </label>
            <label class="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" bind:checked={oaUseBasicAuth} /> Send secret as Basic auth
            </label>
          </div>
          <p class="flex items-center gap-1 text-[11px] text-fainter">
            <ExternalLink size={11} />
            Notion requires a loopback redirect + Basic auth and does not support PKCE.
          </p>
          <div class="flex justify-end gap-2">
            <button class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={resetForms}>Cancel</button>
            <button
              class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg"
              onclick={saveOAuth}
            ><Plus size={14} /> Save & connect</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  code {
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 0.85em;
  }
</style>
