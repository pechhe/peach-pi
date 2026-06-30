<script lang="ts">
  // @-connections picker — the `@` menu.
  //
  // Extracted from Composer.svelte (issue #27). Owns the connections + BWS
  // secrets catalogs (loaded lazily on first `@`), the ensure* loaders, the
  // `event:executorChanged` / `event:bwsChanged` invalidation subscriptions,
  // and the match list filtering the catalog by the active `@query`.
  //
  // The host (Composer) drives caret context: it derives `query` from the
  // textarea and calls `handleMenuKey(e)` for ArrowUp/Down/Enter navigation so
  // the keyboard matrix stays in one place. Picks delegate back to the host,
  // which mutates the pinned-draft chips and re-syncs the textarea.
  import KeyRound from "@lucide/svelte/icons/key-round";
  import ConnectorIcon from "../ConnectorIcon.svelte";
  import { api } from "../../lib/ipc";

  /**
   * One selectable row in the picker: an Executor connection, or a BWS secret
   * (the latter carries an id for `bws_get_secret`).
   */
  export type ConnMenuItem = {
    /** Executor integration slug. */
    integration: string;
    name: string;
    logoUrl: string | null;
  };
  export type SecMenuItem = { id: string; name: string; projectId: string };

  let {
    /** Active `@token` left of the caret, or null when the menu is closed. */
    query,
    /** Active index into the virtual (connections ++ secrets) list. Bindable. */
    index = $bindable(0),
    /** Pin a connection chip (host mutates the draft + refocuses). */
    onPickConnection,
    /** Pin a BWS secret chip (host mutates the draft + refocuses). */
    onPickSecret,
  }: {
    query: string | null;
    index?: number;
    onPickConnection: (c: ConnMenuItem) => void;
    onPickSecret: (s: SecMenuItem) => void;
  } = $props();

  let connectionsCatalog = $state<ConnMenuItem[]>([]);
  let connectionsLoaded = $state(false);
  let secretsCatalog = $state<SecMenuItem[]>([]);
  let secretsLoaded = $state(false);

  // Connections are global, not per-thread; load once on first `@` and refresh
  // when the connector set changes.
  async function ensureConnections() {
    if (connectionsLoaded) return;
    connectionsLoaded = true;
    try {
      const conns = await api.invoke("executor:connections");
      connectionsCatalog = conns.map((c) => ({
        integration: c.integration,
        name: c.identityLabel ?? c.name,
        logoUrl: null,
      }));
    } catch {
      connectionsLoaded = false; // allow retry on next `@`
    }
  }

  /** Refresh the cached catalog when connections change elsewhere in the app
   *  (ConnectorsView add/remove) so the `@` picker stays current. */
  $effect(() => {
    const off = api.on("event:executorChanged", () => {
      connectionsLoaded = false;
      connectionsCatalog = [];
    });
    return off;
  });

  // BWS secrets available to pin with `@`. Values are never loaded — only
  // names + ids + project, so the picker (and any future transcript) shows no
  // cleartext. Refreshed when the Secrets view mutates the set.
  async function ensureSecrets() {
    if (secretsLoaded) return;
    secretsLoaded = true;
    try {
      const status = await api.invoke("bws:status");
      if (!status.authenticated || !status.projectId) {
        secretsCatalog = [];
        return;
      }
      const list = await api.invoke("bws:listSecrets", status.projectId);
      secretsCatalog = (list as { id: string; key: string; projectId: string }[]).map((s) => ({
        id: s.id,
        name: s.key,
        projectId: s.projectId,
      }));
    } catch {
      secretsLoaded = false;
    }
  }

  $effect(() => {
    const off = api.on("event:bwsChanged", () => {
      secretsLoaded = false;
      secretsCatalog = [];
    });
    return off;
  });

  // Load both catalogs on `@`; keep open while the query stays non-null.
  $effect(() => {
    if (query !== null) {
      void ensureConnections();
      void ensureSecrets();
    }
  });

  const atMatches = $derived.by(() => {
    if (query === null) return [];
    const q = query;
    return connectionsCatalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 20);
  });
  const secretMatches = $derived.by(() => {
    if (query === null) return [];
    const q = query;
    return secretsCatalog
      .filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 20);
  });

  /** Combined list length for the virtual index (connections then secrets). */
  const total = $derived(atMatches.length + secretMatches.length);

  $effect(() => {
    void atMatches;
    void secretMatches;
    index = 0;
  });

  /**
   * @-menu keyboard nav, driven from the host's textarea keydown matrix.
   * Returns true when the key is consumed (ArrowUp/Down/Enter with matches),
   * so the host skips its remaining handlers. Mutates the bindable `index`.
   */
  export function handleMenuKey(e: KeyboardEvent): boolean {
    const t = total;
    if (t === 0) return false;
    if (index >= t) index = 0;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % t;
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + t) % t;
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (index < atMatches.length) {
        onPickConnection(atMatches[index]!);
      } else {
        onPickSecret(secretMatches[index - atMatches.length]!);
      }
      return true;
    }
    return false;
  }

  // Expose the picker's referencable types so the host can build Referenced*
  // values from a ConnMenuItem/SecMenuItem without re-declaring them.
  export type { ConnMenuItem as ConnMenuItemType, SecMenuItem as SecMenuItemType };
</script>

{#if query !== null}
  <div
    class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
    data-testid="connections-menu"
  >
    <div class="border-b border-border-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fainter">
      Connections &amp; Secrets <span class="font-normal normal-case text-fainter">· pick to pin @</span>
    </div>
    <div class="max-h-80 overflow-y-auto">
      {#if !connectionsLoaded || !secretsLoaded}
        <div class="px-3 py-2 text-xs text-faint">Loading…</div>
      {:else if atMatches.length === 0 && secretMatches.length === 0}
        <div class="px-3 py-2 text-xs text-faint">
          {connectionsCatalog.length === 0 && secretsCatalog.length === 0
            ? "No connections or secrets yet — add one in Connections / Secrets"
            : "No matching items"}
        </div>
      {:else}
        {#if atMatches.length > 0}
          <div class="border-b border-border-strong/50 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Connections</div>
          {#each atMatches as c, i (c.integration + ":" + c.name)}
            <div class="flex items-center {i === index ? 'bg-surface-2' : ''} hover:bg-surface-2">
              <button
                class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm"
                onclick={() => onPickConnection(c)}
              >
                <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={18} />
                <span class="min-w-0 truncate text-fg">{c.name}</span>
                <span class="ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] lowercase tracking-wide text-muted">{c.integration}</span>
              </button>
            </div>
          {/each}
        {/if}
        {#if secretMatches.length > 0}
          <div class="border-b border-border-strong/50 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Secrets</div>
          {#each secretMatches as s, j (s.id)}
            <div class="flex items-center {atMatches.length + j === index ? 'bg-surface-2' : ''} hover:bg-surface-2">
              <button
                class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm"
                onclick={() => onPickSecret(s)}
              >
                <KeyRound size={18} class="shrink-0 text-amber-600" />
                <span class="min-w-0 truncate font-mono text-fg">{s.name}</span>
                <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-700">secret</span>
              </button>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
{/if}
