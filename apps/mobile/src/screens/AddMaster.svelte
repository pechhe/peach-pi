<script lang="ts">
  import { store } from "../lib/store.svelte.ts";
  import Icon from "../components/Icon.svelte";

  let name = $state("");
  let host = $state("");
  let port = $state("8787");
  let token = $state("");
  let faceId = $state(false);

  const valid = $derived(
    name.trim().length > 0 && host.trim().length > 0 && Number(port) > 0 && token.trim().length > 0,
  );

  async function paste(): Promise<void> {
    try {
      token = (await navigator.clipboard.readText()).trim();
    } catch {
      // Clipboard blocked — the user can type/paste into the field directly.
    }
  }

  function save(): void {
    if (!valid) return;
    store.addMaster({
      name: name.trim(),
      host: host.trim(),
      port: Number(port),
      token: token.trim(),
    });
    store.pop();
  }
</script>

<header class="flex items-center px-4 pt-1 pb-3.5">
  <button class="text-[15px] text-accent" onclick={() => store.pop()}>Cancel</button>
  <span class="mx-auto text-[16px] font-semibold">Add master</span>
  <button class="text-[15px] {valid ? 'text-accent' : 'text-fainter'}" disabled={!valid} onclick={save}>
    Save
  </button>
</header>

<div class="min-h-0 flex-1 overflow-y-auto px-4">
  <div class="mx-3 mt-1.5 mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
    Connection
  </div>
  <div class="overflow-hidden rounded-[14px] border border-border bg-surface">
    <label class="flex items-center border-b border-border px-3.5 py-3">
      <span class="w-16 text-[14px] text-muted">Name</span>
      <input
        class="flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fainter"
        placeholder="master-mac-studio"
        bind:value={name}
        autocapitalize="off"
        autocorrect="off"
      />
    </label>
    <label class="flex items-center border-b border-border px-3.5 py-3">
      <span class="w-16 text-[14px] text-muted">Host</span>
      <input
        class="flex-1 bg-transparent font-mono text-[14px] text-fg outline-none placeholder:text-fainter"
        placeholder="100.84.21.3"
        bind:value={host}
        autocapitalize="off"
        autocorrect="off"
        inputmode="decimal"
      />
    </label>
    <label class="flex items-center px-3.5 py-3">
      <span class="w-16 text-[14px] text-muted">Port</span>
      <input
        class="flex-1 bg-transparent font-mono text-[14px] text-fg outline-none placeholder:text-fainter"
        placeholder="8787"
        bind:value={port}
        inputmode="numeric"
      />
    </label>
  </div>

  <div class="mx-3 mt-[18px] mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
    Bearer token
  </div>
  <div class="flex items-center gap-2 rounded-[14px] border border-border bg-surface px-3.5 py-3">
    <input
      class="flex-1 bg-transparent font-mono text-[14px] tracking-[1px] text-fg outline-none placeholder:text-fainter"
      type="password"
      placeholder="••••••••••••"
      bind:value={token}
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
    />
    <button class="text-[13px] text-accent" onclick={paste}>Paste</button>
  </div>

  <div class="mt-2.5 flex items-center gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-3">
    <span class="text-accent"><Icon name="face-id" size={22} /></span>
    <div class="flex-1">
      <div class="text-[14px]">Protect with Face ID</div>
      <div class="text-[11.5px] text-faint">Unlock token before each session</div>
    </div>
    <button
      class="relative h-[26px] w-11 rounded-full transition-colors {faceId ? 'bg-accent' : 'bg-surface-3'}"
      role="switch"
      aria-checked={faceId}
      aria-label="Protect with Face ID"
      onclick={() => (faceId = !faceId)}
    >
      <span
        class="absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition-[left] {faceId
          ? 'left-[20px]'
          : 'left-0.5'}"
      ></span>
    </button>
  </div>

  <p class="mx-3 mt-2.5 text-[11.5px] leading-[1.5] text-faint">
    The token is the only credential. Being on the tailnet is the full trust boundary.
  </p>
</div>
