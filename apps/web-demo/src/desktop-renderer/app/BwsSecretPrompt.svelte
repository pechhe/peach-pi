<script lang="ts">
  import { onMount } from "svelte";
  import type { BwsSecret, BwsStatus, ReferencedSecret } from "@peach-pi/shared-types";
  import type { DetectedSecret } from "../lib/secret-detect";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import X from "@lucide/svelte/icons/x";

  let { secret, onClose, onPinned }: { secret: DetectedSecret; onClose: () => void; onPinned?: (s: ReferencedSecret) => void } = $props();

  let status = $state<BwsStatus | null>(null);
  let name = $state(secret.suggestedName);
  let projectId = $state<string>("");
  let busy = $state(false);
  let error = $state("");

  const ready = $derived(!!status?.installed && !!status?.authenticated && (status?.projects.length ?? 0) > 0);

  // Existing secrets in the selected project, loaded once a project is picked.
  // BwsSecret carries the cleartext value so we can detect an exact-value
  // duplicate (the strongest "you already stored this key" signal); same
  // exposure class as the Secrets view, which already lists values.
  let secrets = $state<BwsSecret[]>([]);
  let secretsLoading = $state(false);

  // Related = same provider/family token appears in an existing secret's name
  // (e.g. user pasting an OPENAI key sees other OPENAI_* secrets). Helps spot a
  // likely duplicate when the user didn't search first.
  const related = $derived.by(() => {
    if (!secret.family) return [];
    const f = secret.family.toUpperCase();
    return secrets.filter((s) => s.key.toUpperCase().includes(f)).slice(0, 10);
  });
  // Exact value match — almost certainly a duplicate under a different name.
  const valueDup = $derived(secrets.find((s) => s.value.trim() === secret.value.trim()) ?? null);
  // Exact name match — BWS rejects a second secret with the same key in a
  // project, so block store and tell the user to rename.
  const nameDup = $derived(name.trim() ? (secrets.find((s) => s.key === name.trim()) ?? null) : null);

  onMount(() => {
    void (async () => {
      status = await api.invoke("bws:status");
      projectId = status.projectId ?? status.projects[0]?.id ?? "";
    })();
  });

  async function loadSecrets(pid: string) {
    if (!pid) {
      secrets = [];
      return;
    }
    secretsLoading = true;
    try {
      secrets = await api.invoke("bws:listSecrets", pid);
    } catch {
      secrets = [];
    } finally {
      secretsLoading = false;
    }
  }

  // Reload when the selected project changes (incl. the initial pick from
  // status) and when secrets are mutated elsewhere.
  $effect(() => {
    void projectId;
    void loadSecrets(projectId);
  });
  $effect(() => {
    const off = api.on("event:bwsChanged", () => {
      if (projectId) void loadSecrets(projectId);
    });
    return off;
  });

  async function store() {
    if (!name.trim() || !projectId) return;
    busy = true;
    error = "";
    try {
      const created = await api.invoke("bws:createSecret", {
        key: name.trim(),
        value: secret.value,
        projectId,
      });
      extensionUi.notify(`Saved “${name.trim()}” to BWS`);
      if (onPinned && created?.id) {
        onPinned({ id: created.id, name: created.key, projectId: created.projectId });
      }
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const mask = (v: string) => (v.length <= 10 ? "•".repeat(v.length) : `${v.slice(0, 3)}…${v.slice(-3)}`);
</script>

<div
  class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
  data-testid="bws-secret-prompt"
>
  <div class="flex items-center gap-2 border-b border-border-strong px-3 py-2">
    <KeyRound size={14} class="text-muted" />
    <span class="text-xs font-semibold text-fg">Store this secret in BWS?</span>
    <code class="ml-1 truncate font-mono text-[11px] text-fainter">{mask(secret.value)}</code>
    <button
      class="ml-auto rounded p-1 text-fainter hover:bg-bg hover:text-fg"
      onclick={onClose}
      title="Dismiss"
      aria-label="Dismiss"
    ><X size={13} /></button>
  </div>

  {#if status && !ready}
    <p class="px-3 py-2.5 text-xs text-fainter">
      Set up BWS in the <strong class="text-muted">Secrets</strong> tab (install + authenticate, then pick a project) to save pasted secrets.
    </p>
  {:else if status}
    <form class="flex flex-col gap-2 px-3 py-2.5" onsubmit={(e) => { e.preventDefault(); void store(); }}>
      {#if error}
        <p class="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-400">{error}</p>
      {/if}
      {#if secretsLoading}
        <p class="px-1 text-[10px] text-faint">Checking existing secrets in this project…</p>
      {/if}
      {#if valueDup}
        <p class="rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300" data-testid="bws-prompt-value-dup">
          ⚠ This exact value already exists as <code class="font-mono">{valueDup.key}</code> in this project — you are probably duplicating it.
        </p>
      {/if}
      {#if nameDup}
        <p class="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300" data-testid="bws-prompt-name-dup">
          A secret named <code class="font-mono">{nameDup.key}</code> already exists in this project. Rename it, or pick “Not now”.
        </p>
      {/if}
      {#if related.length > 0}
        <details open class="rounded border border-border-strong/60 bg-bg/50 px-2 py-1.5 text-[11px]" data-testid="bws-prompt-related">
          <summary class="cursor-pointer text-faint">
            {related.length} existing secret{related.length === 1 ? "" : "s"} in this project look related{secret.family ? ` (same provider “${secret.family}”)` : ""}
          </summary>
          <ul class="mt-1.5 flex flex-col gap-1">
            {#each related as r (r.id)}
              <li class="flex items-center gap-2 font-mono text-fg-soft">
                <span class="truncate">{r.key}</span>
                {#if r.id === valueDup?.id}
                  <span class="shrink-0 rounded bg-red-500/15 px-1 text-[9px] uppercase tracking-wide text-red-400">exact match</span>
                {/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
      <div class="flex items-center gap-2">
        <label class="flex flex-1 flex-col gap-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-fainter">Name</span>
          <input
            class="rounded-md border border-border-strong bg-bg px-2 py-1 font-mono text-xs text-fg outline-none focus:border-border-focus"
            bind:value={name}
            data-testid="bws-prompt-name"
          />
        </label>
        <label class="flex flex-1 flex-col gap-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-fainter">Project</span>
          <select
            class="rounded-md border border-border-strong bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-border-focus"
            bind:value={projectId}
            data-testid="bws-prompt-project"
          >
            {#each status.projects as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-md px-2.5 py-1 text-xs text-muted hover:text-fg" onclick={onClose}>Not now</button>
        <button
          type="submit"
          class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg disabled:opacity-50"
          disabled={!name.trim() || !projectId || busy || !!nameDup}
          data-testid="bws-prompt-store"
        >{busy ? "Saving…" : "Store secret"}</button>
      </div>
    </form>
  {/if}
</div>
