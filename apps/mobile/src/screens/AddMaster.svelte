<script lang="ts">
  import { store } from "../lib/store.svelte.ts";
  import Icon from "../components/Icon.svelte";

  // Primary path: paste the connect link copied from the host's Remote screen.
  // It carries host + name + passkey in one string (same payload a QR scan
  // delivers via the launch deep link), so there's nothing else to configure.
  let link = $state("");
  let linkError = $state("");
  let showManual = $state(false);

  // Advanced manual entry — only for when the link isn't available.
  let name = $state("");
  let host = $state("");
  let port = $state("8787");
  let token = $state("");

  const hasScheme = $derived(/^https?:\/\//i.test(host.trim()));
  const manualValid = $derived(
    name.trim().length > 0 &&
      host.trim().length > 0 &&
      (hasScheme || Number(port) > 0) &&
      token.trim().length > 0,
  );

  async function paste(): Promise<void> {
    try {
      link = (await navigator.clipboard.readText()).trim();
      linkError = "";
    } catch {
      // Clipboard blocked — the user can type/paste into the field directly.
    }
  }

  function saveLink(): void {
    const m = store.addFromConnectLink(link);
    if (!m) {
      linkError = "That doesn't look like a peach connect link.";
      return;
    }
    // Paired → logged in: land on the machine's thread list as the new root.
    store.resetTo({ name: "sessions", masterId: m.id });
  }

  function saveManual(): void {
    if (!manualValid) return;
    const m = store.addMaster({
      name: name.trim(),
      host: host.trim(),
      port: Number(port),
      token: token.trim(),
    });
    store.resetTo({ name: "sessions", masterId: m.id });
  }
</script>

<header class="flex items-center px-4 pt-1 pb-3.5">
  <button class="text-[15px] text-accent" onclick={() => store.pop()}>Cancel</button>
  <span class="mx-auto text-[16px] font-semibold">Add master</span>
  <span class="w-12"></span>
</header>

<div class="min-h-0 flex-1 overflow-y-auto px-4">
  <div class="mt-2 rounded-[14px] border border-border bg-surface px-3.5 py-3">
    <div class="flex items-center gap-2 text-[14px] text-fg">
      <span class="text-accent"><Icon name="link" size={18} sw={1.6} /></span>
      <span>Paste connect link</span>
    </div>
    <p class="mt-1 text-[12px] leading-[1.5] text-faint">
      Copy it from the host's Remote screen — it carries the host, name and
      passkey in one string.
    </p>
  </div>

  <div class="mt-3 flex items-center gap-2 rounded-[14px] border border-border bg-surface px-3.5 py-3">
    <input
      class="flex-1 bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-fainter"
      placeholder="https://peach-pi-bay.vercel.app/?pair=1&…"
      bind:value={link}
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      inputmode="url"
      oninput={() => (linkError = "")}
    />
    <button class="text-[13px] text-accent" onclick={paste}>Paste</button>
  </div>

  {#if linkError}
    <p class="mx-3 mt-2 text-[12px] text-danger">{linkError}</p>
  {/if}

  <button
    class="mt-3 w-full rounded-[14px] bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-40"
    disabled={link.trim().length === 0}
    onclick={saveLink}
  >
    Connect
  </button>

  <div class="mt-2.5 flex items-start gap-2 px-1">
    <span class="mt-0.5 shrink-0 text-fainter"><Icon name="shield" size={14} sw={1.6} /></span>
    <p class="text-[11.5px] leading-[1.5] text-faint">
      The passkey is the only credential. Being on the tailnet is the full trust
      boundary.
    </p>
  </div>

  <!-- ── Advanced: manual entry (no connect link available) ──── -->
  <button
    class="mt-6 w-full text-center text-[13px] text-muted"
    onclick={() => (showManual = !showManual)}
  >
    {showManual ? "Hide manual entry" : "Enter manually"}
  </button>

  {#if showManual}
    <div class="mt-2">
      <div class="mx-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
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
            placeholder="https://name.your-tailnet.ts.net"
            bind:value={host}
            autocapitalize="off"
            autocorrect="off"
            inputmode="url"
          />
        </label>
        <label class="flex items-center px-3.5 py-3 {hasScheme ? 'opacity-40' : ''}">
          <span class="w-16 text-[14px] text-muted">Port</span>
          <input
            class="flex-1 bg-transparent font-mono text-[14px] text-fg outline-none placeholder:text-fainter"
            placeholder={hasScheme ? "—" : "8787"}
            bind:value={port}
            inputmode="numeric"
            disabled={hasScheme}
          />
        </label>
      </div>
      <p class="mx-3 mt-2 text-[11.5px] leading-[1.5] text-faint">
        Use the Tailscale Serve HTTPS URL (no port). A bare IP + port only works
        when this app is opened over plain HTTP.
      </p>

      <div class="mx-3 mt-[18px] mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
        Passkey
      </div>
      <div class="mx-3 flex items-center gap-2 rounded-[14px] border border-border bg-surface px-3.5 py-3">
        <input
          class="flex-1 bg-transparent font-mono text-[14px] tracking-[1px] text-fg outline-none placeholder:text-fainter"
          type="password"
          placeholder="••••••••••••"
          bind:value={token}
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
        />
      </div>

      <button
        class="mx-3 mt-4 w-[calc(100%-1.5rem)] rounded-[14px] bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-40"
        disabled={!manualValid}
        onclick={saveManual}
      >
        Save
      </button>
    </div>
  {/if}
</div>
