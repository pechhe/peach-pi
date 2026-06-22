<script lang="ts">
  import { onMount } from "svelte";
  import type { BwsStatus } from "@peach-pi/shared-types";
  import type { DetectedSecret } from "../lib/secret-detect";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import X from "@lucide/svelte/icons/x";

  let { secret, onClose }: { secret: DetectedSecret; onClose: () => void } = $props();

  let status = $state<BwsStatus | null>(null);
  let name = $state(secret.suggestedName);
  let projectId = $state<string>("");
  let busy = $state(false);
  let error = $state("");

  const ready = $derived(!!status?.installed && !!status?.authenticated && (status?.projects.length ?? 0) > 0);

  onMount(() => {
    void (async () => {
      status = await api.invoke("bws:status");
      projectId = status.projectId ?? status.projects[0]?.id ?? "";
    })();
  });

  async function store() {
    if (!name.trim() || !projectId) return;
    busy = true;
    error = "";
    try {
      await api.invoke("bws:createSecret", {
        key: name.trim(),
        value: secret.value,
        projectId,
      });
      extensionUi.notify(`Saved “${name.trim()}” to BWS`);
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
          disabled={!name.trim() || !projectId || busy}
          data-testid="bws-prompt-store"
        >{busy ? "Saving…" : "Store secret"}</button>
      </div>
    </form>
  {/if}
</div>
