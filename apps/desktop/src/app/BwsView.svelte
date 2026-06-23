<script lang="ts">
  import { onMount } from "svelte";
  import type { BwsSecret, BwsStatus } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import CopyButton from "./CopyButton.svelte";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Download from "@lucide/svelte/icons/download";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import LogOut from "@lucide/svelte/icons/log-out";

  // Gated flow: install → authenticate → pick project → manage secrets.
  // The access token lives in main (never returned here); secret *values* do
  // cross IPC because this view shows and edits them.
  let status = $state<BwsStatus | null>(null);
  let secrets = $state<BwsSecret[]>([]);
  let error = $state("");
  let busy = $state(false);
  let loadingSecrets = $state(false);

  // Auth form.
  let tokenInput = $state("");

  // Secret filter (mirrors the Settings search bar).
  let query = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);
  const filteredSecrets = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter(
      (s) => s.key.toLowerCase().includes(q) || s.note.toLowerCase().includes(q),
    );
  });

  // Per-secret reveal + the secret currently being edited.
  let revealed = $state<Record<string, boolean>>({});
  let editingId = $state<string | null>(null);
  let creating = $state(false);

  // Draft fields shared by the create + edit forms.
  let draftKey = $state("");
  let draftValue = $state("");
  let draftNote = $state("");

  /** Typing anywhere in BWS starts the search without clicking the box first. */
  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1) return;
    const t = e.target as HTMLElement | null;
    if (t === searchInput) return;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    query += e.key;
    searchInput?.focus();
    e.preventDefault();
  }

  const selectedProjectId = $derived(status?.projectId ?? null);

  async function loadStatus() {
    error = "";
    try {
      status = await api.invoke("bws:status");
      if (status.error) error = status.error;
    } catch (e) {
      error = msg(e);
    }
  }

  async function loadSecrets() {
    if (!status?.authenticated || !selectedProjectId) {
      secrets = [];
      return;
    }
    loadingSecrets = true;
    try {
      secrets = await api.invoke("bws:listSecrets", selectedProjectId);
    } catch (e) {
      error = msg(e);
    } finally {
      loadingSecrets = false;
    }
  }

  onMount(() => {
    void (async () => {
      await loadStatus();
      await loadSecrets();
    })();
    return api.on("event:bwsChanged", () => {
      void (async () => {
        await loadStatus();
        await loadSecrets();
      })();
    });
  });

  async function install() {
    busy = true;
    error = "";
    try {
      const r = await api.invoke("bws:install");
      if (!r.ok) error = r.error ?? "Install failed.";
      await loadStatus();
    } finally {
      busy = false;
    }
  }

  async function saveToken() {
    if (!tokenInput.trim()) return;
    busy = true;
    error = "";
    try {
      status = await api.invoke("bws:setAccessToken", tokenInput.trim());
      tokenInput = "";
      if (status.error) error = status.error;
      await loadSecrets();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    busy = true;
    try {
      status = await api.invoke("bws:clearAuth");
      secrets = [];
    } finally {
      busy = false;
    }
  }

  async function pickProject(projectId: string) {
    busy = true;
    error = "";
    try {
      status = await api.invoke("bws:setProject", projectId || null);
      await loadSecrets();
    } finally {
      busy = false;
    }
  }

  function startCreate() {
    creating = true;
    editingId = null;
    draftKey = "";
    draftValue = "";
    draftNote = "";
  }

  function startEdit(s: BwsSecret) {
    editingId = s.id;
    creating = false;
    draftKey = s.key;
    draftValue = s.value;
    draftNote = s.note;
  }

  function cancelForm() {
    creating = false;
    editingId = null;
  }

  const draftValid = $derived(!!draftKey.trim() && !!draftValue.trim());

  async function submitCreate() {
    if (!draftValid || !selectedProjectId) return;
    busy = true;
    error = "";
    try {
      await api.invoke("bws:createSecret", {
        key: draftKey.trim(),
        value: draftValue,
        projectId: selectedProjectId,
        note: draftNote.trim() || undefined,
      });
      cancelForm();
      await loadSecrets();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  async function submitEdit(s: BwsSecret) {
    if (!draftValid) return;
    busy = true;
    error = "";
    try {
      await api.invoke("bws:editSecret", s.id, {
        key: draftKey.trim() !== s.key ? draftKey.trim() : undefined,
        value: draftValue !== s.value ? draftValue : undefined,
        note: draftNote !== s.note ? draftNote : undefined,
      });
      cancelForm();
      await loadSecrets();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  async function remove(s: BwsSecret) {
    confirmRemove(s);
  }

  // Confirm-delete dialog (Bits UI AlertDialog).
  let deleteOpen = $state(false);
  let deleteTarget = $state<BwsSecret | null>(null);

  function confirmRemove(s: BwsSecret) {
    deleteTarget = s;
    deleteOpen = true;
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    busy = true;
    error = "";
    try {
      await api.invoke("bws:deleteSecret", deleteTarget.id);
      deleteTarget = null;
      await loadSecrets();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  function msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
  const mask = (v: string) => "•".repeat(Math.min(Math.max(v.length, 6), 24));
</script>

<svelte:window onkeydown={onWindowKeydown} />

<main class="flex h-full flex-1 flex-col overflow-y-auto" data-testid="bws-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-6">
    <KeyRound size={16} class="text-muted" />
    <h1 class="text-sm font-semibold text-fg">Secrets · BWS</h1>
    {#if status?.authenticated}
      <span class="ml-2 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
        <ShieldCheck size={12} /> Connected{#if status.version} · v{status.version}{/if}
      </span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if status?.authenticated}
        <input
          type="search"
          bind:this={searchInput}
          bind:value={query}
          placeholder="Search secrets…"
          class="w-48 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-fg outline-none focus:border-border-focus"
          data-testid="bws-search"
          aria-label="Search secrets"
        />
      {/if}
      {#if status?.installed}
        <button
          class="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
          onclick={() => { void loadStatus(); void loadSecrets(); }}
          title="Refresh"
          aria-label="Refresh"
        ><RefreshCw size={14} /></button>
      {/if}
      {#if status?.tokenSource === "shell"}
        <span class="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-muted" title="BWS_ACCESS_TOKEN from your login shell">Using shell token</span>
      {:else if status?.tokenSource === "saved"}
        <button
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface hover:text-fg"
          onclick={signOut}
          disabled={busy}
        ><LogOut size={13} /> Sign out</button>
      {/if}
    </div>
  </header>

  <div class="mx-auto w-full max-w-3xl px-6 pb-10">
    {#if error}
      <p class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400" data-testid="bws-error">{error}</p>
    {/if}

    {#if !status}
      <p class="py-10 text-center text-sm text-fainter">Loading…</p>

    {:else if !status.installed}
      <!-- ── Install ─────────────────────────────────────────── -->
      <section class="rounded-xl border border-border bg-surface p-6 text-center">
        <Download size={28} class="mx-auto text-muted" />
        <h2 class="mt-3 text-base font-semibold text-fg">Install the bws CLI</h2>
        <p class="mx-auto mt-1 max-w-md text-sm text-fg-soft">
          The Bitwarden Secrets Manager CLI (<code class="rounded bg-bg px-1 text-xs">bws</code>)
          isn't on this machine yet. Download the latest release and store it in
          <code class="rounded bg-bg px-1 text-xs">~/.pi/agent/bin</code>.
        </p>
        <button
          class="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
          onclick={() => { playButtonClick(); void install(); }}
          disabled={busy}
          data-testid="bws-install"
        >{busy ? "Installing…" : "Install bws"}</button>
      </section>

    {:else if !status.authenticated}
      <!-- ── Authenticate ────────────────────────────────────── -->
      <section class="rounded-xl border border-border bg-surface p-6">
        <div class="flex items-center gap-2">
          <ShieldCheck size={18} class="text-muted" />
          <h2 class="text-base font-semibold text-fg">Authenticate</h2>
        </div>
        <p class="mt-1 text-sm text-fg-soft">
          Paste a machine-account <strong>access token</strong> from Secrets Manager.
          It's stored on this device and used to run <code class="rounded bg-bg px-1 text-xs">bws</code>
          — it's never sent to the model or the renderer.
        </p>
        <p class="mt-2 text-xs text-fainter">
          No <code class="rounded bg-bg px-1">BWS_ACCESS_TOKEN</code> was found in your login
          shell. If you export one in <code class="rounded bg-bg px-1">~/.zshrc</code>, restart
          the app to pick it up automatically — or just paste it here.
        </p>
        <form class="mt-4 flex flex-col gap-3" onsubmit={(e) => { e.preventDefault(); void saveToken(); }}>
          <input
            type="password"
            class="rounded-lg border border-border-strong bg-bg px-3 py-2 font-mono text-sm text-fg outline-none focus:border-border-focus"
            placeholder="0.48c78342-… : B3h5D+…"
            bind:value={tokenInput}
            data-testid="bws-token"
          />
          <div class="flex justify-end">
            <button
              type="submit"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
              disabled={!tokenInput.trim() || busy}
              data-testid="bws-authenticate"
            >{busy ? "Checking…" : "Authenticate"}</button>
          </div>
        </form>
      </section>

    {:else}
      <!-- ── Project + secrets ───────────────────────────────── -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold uppercase tracking-wider text-fainter">Project</span>
          <select
            class="rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-border-focus"
            value={selectedProjectId ?? ""}
            onchange={(e) => pickProject((e.currentTarget as HTMLSelectElement).value)}
            disabled={busy}
            data-testid="bws-project"
          >
            <option value="" disabled>Select a project…</option>
            {#each status.projects as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        {#if status.projects.length === 0}
          <p class="mt-2 text-xs text-fainter">This token has no projects it can access.</p>
        {/if}
      </section>

      {#if selectedProjectId}
        <div class="mt-6 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-fg">
            Secrets <span class="text-fainter">{query.trim() ? `${filteredSecrets.length}/${secrets.length}` : secrets.length}</span>
          </h2>
          <button
            class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50"
            onclick={startCreate}
            disabled={busy || creating}
            data-testid="bws-add-secret"
          ><Plus size={14} /> Add secret</button>
        </div>

        {#if creating}
          <form
            class="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
            onsubmit={(e) => { e.preventDefault(); void submitCreate(); }}
            data-testid="bws-create-form"
          >
            {@render fields()}
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={cancelForm}>Cancel</button>
              <button type="submit" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50" disabled={!draftValid || busy}>
                {busy ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        {/if}

        <div class="mt-3 overflow-hidden rounded-xl border border-border">
          {#if loadingSecrets}
            <p class="px-4 py-6 text-center text-sm text-fainter">Loading secrets…</p>
          {:else if secrets.length === 0}
            <p class="px-4 py-6 text-center text-sm text-fainter">No secrets in this project yet.</p>
          {:else if filteredSecrets.length === 0}
            <p class="px-4 py-6 text-center text-sm text-fainter" data-testid="bws-search-empty">No secrets match “{query.trim()}”.</p>
          {:else}
            {#each filteredSecrets as s, i (s.id)}
              <div class="bg-surface px-4 py-3" class:border-t={i > 0} class:border-border={i > 0} data-testid="bws-secret">
                {#if editingId === s.id}
                  <form class="flex flex-col gap-3" onsubmit={(e) => { e.preventDefault(); void submitEdit(s); }}>
                    {@render fields()}
                    <div class="flex justify-end gap-2">
                      <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" onclick={cancelForm}>Cancel</button>
                      <button type="submit" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-50" disabled={!draftValid || busy}>
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                {:else}
                  <div class="group flex items-start gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-mono text-sm font-medium text-fg">{s.key}</p>
                      <div class="mt-1 flex items-center gap-2">
                        <code class="truncate font-mono text-xs text-muted">{revealed[s.id] ? s.value : mask(s.value)}</code>
                        <button
                          class="shrink-0 text-fainter hover:text-fg"
                          onclick={() => (revealed = { ...revealed, [s.id]: !revealed[s.id] })}
                          title={revealed[s.id] ? "Hide" : "Reveal"}
                          aria-label={revealed[s.id] ? "Hide value" : "Reveal value"}
                        >{#if revealed[s.id]}<EyeOff size={13} />{:else}<Eye size={13} />{/if}</button>
                        <CopyButton text={s.value} label="" class="shrink-0 !px-1 !py-0.5 text-xs" />
                      </div>
                      {#if s.note}
                        <p class="mt-1 line-clamp-2 text-xs text-fainter">{s.note}</p>
                      {/if}
                    </div>
                    <div class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button class="rounded-md p-1.5 text-fainter hover:bg-bg hover:text-fg" onclick={() => startEdit(s)} title="Edit" aria-label="Edit secret"><Pencil size={14} /></button>
                      <button class="rounded-md p-1.5 text-fainter hover:bg-bg hover:text-red-400" onclick={() => remove(s)} title="Delete" aria-label="Delete secret"><Trash2 size={14} /></button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</main>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete secret?"
  description={`Permanently deletes “${deleteTarget?.key ?? ""}” from Secrets Manager. This cannot be undone.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  destructive
  error={error}
  onConfirm={() => void executeDelete()}
/>

{#snippet fields()}
  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-fg">Key</span>
    <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-border-focus"
      placeholder="STRIPE_API_KEY" bind:value={draftKey} data-testid="bws-field-key" />
  </label>
  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-fg">Value</span>
    <textarea class="min-h-[60px] resize-y rounded-lg border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-border-focus"
      placeholder="••••••••" bind:value={draftValue} data-testid="bws-field-value"></textarea>
  </label>
  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-fg">Note <span class="text-fainter">(optional)</span></span>
    <input class="rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-border-focus"
      placeholder="What this is for" bind:value={draftNote} data-testid="bws-field-note" />
  </label>
{/snippet}
