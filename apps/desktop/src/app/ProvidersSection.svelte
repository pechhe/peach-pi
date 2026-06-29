<script lang="ts">
  import { onMount } from "svelte";
  import type { AuthProviderStatus } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { providers } from "../stores/providers.svelte";
  import ProviderLoginDialog from "./ProviderLoginDialog.svelte";
  import Check from "@lucide/svelte/icons/check";
  import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";

  // Which provider's inline API-key form is open, and its draft value.
  let keyForm = $state<string | null>(null);
  let keyDraft = $state("");
  // Row whose kebab action menu is open.
  let menuOpen = $state<string | null>(null);
  // "Add provider" search panel open?
  let adding = $state(false);
  let query = $state("");
  // The provider being signed in via the OAuth dialog (null = closed).
  let loginProvider = $state<AuthProviderStatus | null>(null);
  // Renderer-local fresh-load flag.
  let ready = $state(false);

  onMount(() => void providers.load().then(() => (ready = true)));

  const configured = $derived(providers.list.filter((p) => p.configured));
  const unconfigured = $derived(providers.list.filter((p) => !p.configured));
  const filteredAdd = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? unconfigured.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : unconfigured;
  });

  function sourceLabel(p: AuthProviderStatus): string {
    if (p.label) return p.label;
    switch (p.source) {
      case "environment": return "Environment variable";
      case "stored": return "Signed in";
      case "models_json_key":
      case "models_json_command": return "models.json";
      default: return "Configured";
    }
  }

  function startOAuth(p: AuthProviderStatus) {
    menuOpen = null;
    loginProvider = p;
    void api.invoke("auth:startOAuthLogin", p.id);
  }

  function toggleKeyForm(id: string) {
    keyForm = keyForm === id ? null : id;
    keyDraft = "";
    menuOpen = null;
  }

  async function saveKey(id: string) {
    if (!keyDraft.trim()) return;
    await providers.loginApiKey(id, keyDraft.trim());
    keyForm = null;
    keyDraft = "";
  }

  function openAdd() {
    adding = true;
    query = "";
  }
</script>

<div>
  <h2 class="text-sm text-fg">Providers & login</h2>
  <p class="text-xs text-faint">
    Sign in to your subscription (Claude, ChatGPT, Copilot) or store an API key.
    Backed by pi's <code>auth.json</code> — the same credentials the pi CLI uses.
  </p>
</div>

<!-- Configured providers: compact rows + kebab action menu -->
<div class="mt-3 flex flex-col gap-1.5" data-testid="providers-configured">
  {#if ready && configured.length === 0}
    <p class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-fainter">
      No providers configured yet.
    </p>
  {/if}
  {#each configured as p (p.id)}
    <div class="rounded-md border border-border bg-surface-2/40 px-3 py-2" data-testid="provider-row" data-provider={p.id}>
      <div class="flex items-center gap-2">
        <span class="truncate text-xs font-medium text-fg">{p.name}</span>
        <span class="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-400">
          <Check size={9} /> {sourceLabel(p)}
        </span>

        <div class="relative ml-auto">
          <button
            class="rounded p-1 text-fainter hover:bg-bg hover:text-fg"
            onclick={() => (menuOpen = menuOpen === p.id ? null : p.id)}
            aria-label="Actions"
            data-testid="provider-menu"
          ><MoreHorizontal size={14} /></button>
          {#if menuOpen === p.id}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="fixed inset-0 z-40" onclick={() => (menuOpen = null)}></div>
            <div class="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-md border border-border-strong bg-surface shadow-lg">
              {#if p.oauth}
                <button class="block w-full px-3 py-1.5 text-left text-xs text-fg hover:bg-surface-2" onclick={() => startOAuth(p)}>Re-sign in</button>
              {/if}
              <button class="block w-full px-3 py-1.5 text-left text-xs text-fg hover:bg-surface-2" onclick={() => toggleKeyForm(p.id)}>Edit API key</button>
              <button class="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-surface-2" onclick={() => { menuOpen = null; void providers.logout(p.id); }}>Remove</button>
            </div>
          {/if}
        </div>
      </div>

      {#if keyForm === p.id}
        <form class="mt-2 flex gap-2" onsubmit={(e) => { e.preventDefault(); void saveKey(p.id); }}>
          <input
            type="password"
            class="flex-1 rounded-md border border-border-strong bg-bg px-2 py-1 font-mono text-xs text-fg outline-none focus:border-border-focus"
            placeholder="Paste API key…"
            bind:value={keyDraft}
            data-testid="provider-key-input"
          />
          <button
            type="submit"
            class="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-fg disabled:opacity-50"
            disabled={!keyDraft.trim()}
            data-testid="provider-key-save"
          >Save</button>
        </form>
      {/if}
    </div>
  {/each}
</div>

<!-- Add a provider: searchable picker for unconfigured providers -->
{#if adding}
  <div class="mt-3 rounded-md border border-border bg-surface-2/40" data-testid="provider-add">
    <div class="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
      <Search size={12} class="text-fainter" />
      <input
        class="flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fainter"
        placeholder="Search providers…"
        bind:value={query}
        data-testid="provider-add-search"
      />
      <button class="rounded px-1.5 py-0.5 text-[11px] text-fainter hover:text-fg" onclick={() => (adding = false)}>Esc</button>
    </div>
    <div class="max-h-64 overflow-y-auto p-1">
      {#if filteredAdd.length === 0}
        <p class="px-2 py-3 text-center text-[11px] text-fainter">No providers match “{query}”.</p>
      {/if}
      {#each filteredAdd as p (p.id)}
        <div class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2" data-testid="provider-add-row" data-provider={p.id}>
          <span class="truncate text-xs text-fg">{p.name}</span>
          <div class="ml-auto flex items-center gap-1.5">
            {#if p.oauth}
              <button
                class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3"
                onclick={() => startOAuth(p)}
              >Sign in</button>
            {/if}
            <button
              class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3"
              onclick={() => { adding = false; toggleKeyForm(p.id); }}
            >API key</button>
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <button
    class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted hover:bg-surface-2 hover:text-fg"
    onclick={openAdd}
    data-testid="provider-add-toggle"
  >
    <Plus size={13} /> Add provider
  </button>
{/if}

{#if loginProvider}
  <ProviderLoginDialog providerName={loginProvider.name} onClose={() => (loginProvider = null)} />
{/if}
