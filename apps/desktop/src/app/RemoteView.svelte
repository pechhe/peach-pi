<script lang="ts">
  import { onMount } from "svelte";
  import {
    type RemoteHostConfig,
    type RemoteConnectInfo,
    type RemoteHostConnection,
    type RemoteTailnetPeer,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import { remoteFirst } from "../stores/remote-first.svelte";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Radio from "@lucide/svelte/icons/radio";
  import Link from "@lucide/svelte/icons/link";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Smartphone from "@lucide/svelte/icons/smartphone";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import CopyButton from "./CopyButton.svelte";
  import { Switch } from "../components/ui/switch";

  // ── Master side: host serving status ────────────────────────────────
  let hostStatus = $state<RemoteHostConfig | null>(null);
  let localProjects = $state<{ id: string; name: string; path: string }[]>([]);
  let togglingHost = $state(false);

  // ── Phone pairing: Tailscale Serve (HTTPS) + QR connect deep link ───
  let connect = $state<RemoteConnectInfo | null>(null);

  // ── Client side: saved master connections ───────────────────────────
  let hosts = $state<RemoteHostConnection[]>([]);
  let error = $state("");

  // New-host form.
  let showAddHost = $state(false);
  let newName = $state("");
  let newHost = $state("");
  let newPort = $state("");
  let newToken = $state("");
  // Primary attach path: pick a tailnet machine + enter its passkey. Paste-link
  // and manual entry are hidden behind `showManual`.
  let peers = $state<RemoteTailnetPeer[]>([]);
  let pickedPeer = $state("");
  let newLink = $state("");
  let linkError = $state("");
  let showManual = $state(false);

  async function loadHost() {
    [hostStatus, hosts] = await Promise.all([
      api.invoke("remote:hostStatus"),
      api.invoke("remote:listHosts"),
    ]);
    void loadConnect();
  }

  /** Refresh phone-pairing info (MagicDNS, Serve status, QR). Only meaningful
   *  while serving; cheap enough to call alongside loadHost. */
  async function loadConnect() {
    try {
      connect = hostStatus?.enabled ? await api.invoke("remote:connectInfo") : null;
    } catch {
      connect = null;
    }
  }

  async function loadLocalProjects() {
    const snap = await api.invoke("app:getSnapshot");
    localProjects = snap.projects.map((p) => ({ id: p.id, name: p.name, path: p.path }));
  }

  async function toggleHost(on: boolean) {
    togglingHost = true;
    try {
      hostStatus = await api.invoke("remote:setHostEnabled", on);
      error = "";
      await loadConnect();
    } catch (e) {
      error = String((e as Error).message ?? e);
    } finally {
      togglingHost = false;
    }
  }

  async function setProjectServed(projectId: string, on: boolean) {
    hostStatus = await api.invoke("remote:setProjectServed", projectId, on);
  }

  async function setServeAll(on: boolean) {
    hostStatus = await api.invoke("remote:setServeAll", on);
  }

  async function regenerateToken() {
    hostStatus = await api.invoke("remote:regenerateToken");
  }

  async function addHost() {
    if (!newName.trim() || !newHost.trim()) return;
    await api.invoke("remote:addHost", {
      name: newName.trim(),
      host: newHost.trim(),
      port: Number(newPort) || 0,
      token: newToken.trim(),
    });
    newName = newHost = newPort = newToken = "";
    showAddHost = false;
    hosts = await api.invoke("remote:listHosts");
  }

  /** Parse a connect deep link (`?pair=1&name=&host=&token=`) into a host
   *  input, mirroring the mobile `parseConnectLink`. */
  function parseConnectLink(raw: string): { name: string; host: string; port: number; token: string } | null {
    let p: URLSearchParams | null = null;
    try {
      const u = new URL(raw);
      p = u.searchParams.get("pair") === "1" ? u.searchParams : null;
    } catch {
      return null;
    }
    if (!p) return null;
    const host = (p.get("host") ?? "").trim();
    const token = (p.get("token") ?? "").trim();
    const name = (p.get("name") ?? host).trim() || host;
    if (!host || !token) return null;
    return { name, host, port: 0, token };
  }

  async function loadPeers() {
    try {
      peers = await api.invoke("remote:listTailnetPeers");
    } catch {
      peers = [];
    }
  }

  async function addHostFromPeer() {
    const peer = peers.find((p) => p.magicDnsName === pickedPeer);
    if (!peer || !newToken.trim()) return;
    await api.invoke("remote:addHost", {
      name: peer.name,
      host: peer.httpsUrl,
      port: 0,
      token: newToken.trim(),
    });
    pickedPeer = "";
    newToken = "";
    showAddHost = false;
    hosts = await api.invoke("remote:listHosts");
  }

  async function pasteLink(): Promise<void> {
    try {
      newLink = (await navigator.clipboard.readText()).trim();
      linkError = "";
    } catch {
      // Clipboard blocked — user can paste into the field directly.
    }
  }

  async function addHostFromLink() {
    const input = parseConnectLink(newLink);
    if (!input) {
      linkError = "That doesn't look like a peach connect link.";
      return;
    }
    await api.invoke("remote:addHost", input);
    newLink = "";
    showAddHost = false;
    hosts = await api.invoke("remote:listHosts");
  }

  async function removeHost(id: string) {
    await api.invoke("remote:removeHost", id);
    hosts = await api.invoke("remote:listHosts");
  }

  onMount(() => {
    loadHost();
    loadLocalProjects();
    void remoteFirst.load();
  });
</script>

<div class="flex h-full flex-col">
  <header class="flex items-center justify-between border-b border-border px-6 py-3">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-fg">
      <Radio size={15} /> Remote Sessions
    </h2>
    <button
      class="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
      onclick={() => { loadHost(); loadLocalProjects(); }}
      title="Refresh"
    >
      <RefreshCw size={14} />
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
    {#if error}
      <div class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    {/if}

    <!-- ── Remote-first mode (movable execution, docs/remote-handoff.md) ─── -->
    <section class="mb-6 rounded-md border border-border bg-surface-1 px-3.5 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[13px] font-medium text-fg">Remote-first mode</p>
          <p class="mt-0.5 text-xs text-faint">
            {remoteFirst.mode.enabled
              ? remoteFirst.mode.hasRemoteMachine
                ? `New threads + messages hand off to ${remoteFirst.mode.targetMachine ?? "the remote machine"}.`
                : "On, but no remote machine is registered — add a machine below."
              : "New threads + messages run locally; nothing is handed off."}
          </p>
        </div>
        <Switch
          checked={remoteFirst.mode.enabled}
          onCheckedChange={(v) => remoteFirst.toggle(v)}
          data-testid="remote-first-toggle"
          aria-label="Toggle remote-first mode"
        />
      </div>
    </section>

    <!-- ── Master side: serve your sessions ─────────────────────── -->
    <section class="mb-6">
      <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
        <Monitor size={13} /> Host — serve this machine
      </h3>
      <div class="rounded-lg border border-border bg-surface-2 p-3">
        {#if hostStatus}
          <div class="flex items-center gap-2 text-[13px]">
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium {hostStatus?.enabled
                ? 'bg-green-600 text-white'
                : 'bg-surface-3 text-muted hover:text-fg'}"
              onclick={() => toggleHost(!hostStatus!.enabled)}
              disabled={togglingHost}
            >
              {hostStatus.enabled ? "● Watching allowed" : "○ Off"}
            </button>
            {#if hostStatus.token}
              <span class="text-xs text-faint">passkey</span>
              <code class="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {hostStatus.token.slice(0, 8)}…{hostStatus.token.slice(-4)}
              </code>
              <CopyButton text={hostStatus.token} />
            {/if}
            {#if hostStatus.enabled && hostStatus.bindIp}
              <span class="ml-auto text-[10px] text-faint">
                <span class="font-mono">{hostStatus.bindIp}:{hostStatus.port}</span>
              </span>
            {:else if hostStatus.enabled}
              <span class="ml-auto text-[10px] text-amber-400">starting…</span>
            {/if}
          </div>

          {#if hostStatus.enabled}
            <p class="mt-1.5 text-[11px] text-faint">
              Serving all projects. Anyone with the passkey on your tailnet can watch.
            </p>

            <!-- ── Phone pairing: QR (Serve is auto-enabled in the toggle) ── -->
            <div class="mt-3 rounded-md border border-border bg-surface p-3">
              <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Smartphone size={13} /> Watch on your phone
              </div>

              {#if connect?.connectUrl && connect.qrSvg}
                <div class="flex items-start gap-3">
                  <!-- QR encodes the watch-app deep link (host + token prefilled) -->
                  <div class="size-32 shrink-0 rounded-md bg-white p-1.5 [&>svg]:size-full">
                    {@html connect.qrSvg}
                  </div>
                  <div class="min-w-0 flex-1 text-xs text-faint">
                    <p class="mb-1.5 text-fg">Scan to open the watch app and connect in one tap.</p>
                    <div class="mb-2 flex items-center gap-1 text-green-400">
                      <ShieldCheck size={12} />
                      <span class="truncate font-mono text-[11px]">{connect.httpsUrl}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <CopyButton text={connect.connectUrl} />
                      <span class="text-[11px]">Copy link</span>
                    </div>
                    <p class="mt-2 text-[10px] leading-relaxed text-faint">
                      The link carries the passkey — only open it on your own device.
                    </p>
                  </div>
                </div>
              {:else if connect && !connect.serveActive}
                <p class="mb-2 text-xs text-faint">
                  {#if connect.httpsUrl}
                    Enabling HTTPS access via Tailscale Serve…
                  {:else}
                    Tailscale isn't reachable — start it, then refresh.
                  {/if}
                </p>
                {#if connect.serveHint}
                  <p class="font-mono text-[10px] text-faint">
                    or run: {connect.serveHint}
                  </p>
                {/if}
              {:else}
                <p class="text-xs text-faint">Resolving Tailscale endpoint…</p>
              {/if}
            </div>
          {/if}

          <!-- ── Advanced: regenerate passkey + per-project selection ─── -->
          <details class="mt-3">
            <summary class="cursor-pointer select-none text-[11px] text-muted hover:text-fg">
              Advanced
            </summary>
            <div class="mt-2 space-y-2 border-t border-border pt-2">
              {#if hostStatus.token}
                <button class="text-xs text-muted hover:text-fg" onclick={regenerateToken}>
                  Regenerate passkey
                </button>
                <p class="text-[10px] text-faint">
                  Invalidates all existing watch connections.
                </p>
              {/if}
              <div>
                <p class="mb-1.5 text-xs text-faint">Projects served:</p>
                <div class="max-h-40 overflow-y-auto space-y-1">
                  <label class="flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-3">
                    <input
                      type="checkbox"
                      checked={hostStatus.serveAll}
                      onchange={(e) => setServeAll(e.currentTarget.checked)}
                    />
                    <span class="font-medium text-fg">All projects</span>
                    <span class="ml-auto text-[10px] text-faint">includes future</span>
                  </label>
                  {#each localProjects as p (p.id)}
                    <label
                      class="flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-3"
                      class:opacity-50={hostStatus.serveAll}
                    >
                      <input
                        type="checkbox"
                        checked={hostStatus.serveAll || hostStatus.servedProjects.includes(p.id)}
                        disabled={hostStatus.serveAll}
                        onchange={(e) => setProjectServed(p.id, e.currentTarget.checked)}
                      />
                      <span class="truncate text-fg">{p.name}</span>
                      <span class="ml-auto truncate text-[10px] text-faint" title={p.path}>{p.path}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
          </details>
        {/if}
      </div>
    </section>

    <!-- ── Client side: attach to a master ──────────────────────── -->
    <section class="mb-6">
      <h3 class="mb-2 flex items-center justify-between text-xs font-semibold tracking-wide text-faint uppercase">
        <span class="flex items-center gap-1.5"><Radio size={13} /> Attach — watch a master</span>
        <button
          class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          onclick={() => { showAddHost = !showAddHost; if (showAddHost) void loadPeers(); }}
          title="Add master"
        >
          <Plus size={13} />
        </button>
      </h3>

      {#if showAddHost}
        <div class="mb-3 rounded-lg border border-border bg-surface-2 p-3">
          <div class="mb-2 flex items-center gap-2 text-[13px] text-fg">
            <Smartphone size={14} /> Pick a machine and enter its passkey
          </div>

          {#if peers.length > 0}
            <select
              bind:value={pickedPeer}
              class="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-fg"
            >
              <option value="" disabled>Choose a tailnet machine…</option>
              {#each peers as p (p.magicDnsName)}
                <option value={p.magicDnsName} disabled={!p.online}>
                  {p.name}{p.online ? "" : " (offline)"}
                </option>
              {/each}
            </select>
          {:else}
            <p class="text-[11px] text-faint">
              No tailnet machines found. Is Tailscale running? Use a connect link below instead.
            </p>
          {/if}

          <div class="mt-2 flex items-center gap-2">
            <input
              bind:value={newToken}
              type="password"
              placeholder="passkey"
              class="flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-[13px] tracking-[1px] text-fg"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
            />
          </div>
          <button
            class="mt-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            disabled={!pickedPeer || newToken.trim().length === 0}
            onclick={addHostFromPeer}
          >
            Connect
          </button>
          <button class="ml-2 text-[11px] text-muted hover:text-fg" onclick={loadPeers}>refresh list</button>

          <!-- Advanced: paste a connect link or type the address by hand. -->
          <button
            class="mt-3 block text-[11px] text-muted hover:text-fg"
            onclick={() => (showManual = !showManual)}
          >
            {showManual ? "Hide other ways to connect" : "Other ways to connect"}
          </button>
          {#if showManual}
            <div class="mt-2 space-y-2 border-t border-border pt-2">
              <div class="flex items-center gap-2 text-[12px] text-fg">
                <Link size={13} /> Paste connect link
              </div>
              <div class="flex items-center gap-2">
                <input
                  bind:value={newLink}
                  oninput={() => (linkError = "")}
                  placeholder="https://peach-pi-bay.vercel.app/?pair=1&…"
                  class="flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-[12px] text-fg"
                />
                <button class="text-xs text-muted hover:text-fg" onclick={pasteLink}>paste</button>
              </div>
              {#if linkError}
                <p class="text-[11px] text-red-400">{linkError}</p>
              {/if}
              <button
                class="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                disabled={newLink.trim().length === 0}
                onclick={addHostFromLink}
              >
                Connect from link
              </button>

              <div class="grid grid-cols-2 gap-2 border-t border-border pt-2 text-[13px]">
                <input bind:value={newName} placeholder="Name (master-mac)" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
                <input bind:value={newHost} placeholder="tailnet host / IP" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
                <input bind:value={newPort} placeholder="port" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
                <input bind:value={newToken} placeholder="passkey" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
              </div>
              <button class="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white" onclick={addHost}>
                Save manual
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#each hosts as h (h.id)}
        <div class="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <Radio size={13} class="shrink-0 text-faint" />
          <span class="text-[13px] font-medium text-fg">{h.name}</span>
          <span class="truncate font-mono text-[11px] text-faint">{h.host}</span>
          <button
            class="ml-auto rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400"
            onclick={() => removeHost(h.id)}
            title="Disconnect"
          >
            <Trash2 size={12} />
          </button>
        </div>
      {/each}
      {#if hosts.length > 0}
        <p class="px-1 pt-1 text-[11px] leading-relaxed text-faint">
          Threads from connected masters appear in the sidebar, tagged remote — open
          and steer them like local threads.
        </p>
      {/if}
    </section>

  </div>
</div>
