<script lang="ts">
  import { onMount } from "svelte";
  import type { AgentBrowserState, CuaDriverStatus } from "@peach-pi/shared-types";
  import Check from "@lucide/svelte/icons/check";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import { api } from "../../../lib/ipc";

  // Computer use: native agent_browser (web) + cua-driver (native desktop).
  let agentBrowser = $state<AgentBrowserState | null>(null);
  let cuaDriver = $state<CuaDriverStatus | null>(null);
  let installingBrowser = $state(false);
  let grantingCua = $state(false);
  // A step is "ok" when installed and (for cua-driver) permissions granted.
  const browserReady = $derived(!!agentBrowser?.installed && !!agentBrowser?.binaryVersion);
  const cuaReady = $derived(
    !!cuaDriver?.installed &&
      cuaDriver.accessibility === "granted" &&
      cuaDriver.screenRecording === "granted",
  );
  const computerUseReady = $derived(browserReady && cuaReady);

  onMount(() => {
    void loadComputerUse();
  });

  async function loadComputerUse() {
    // allSettled: a hung/rejected status (e.g. cua check_permissions while a
    // TCC prompt is open) must not mask the other component's state.
    const [ab, cd] = await Promise.allSettled([
      api.invoke("agentBrowser:state"),
      api.invoke("cuaDriver:status"),
    ]);
    if (ab.status === "fulfilled") agentBrowser = ab.value;
    if (cd.status === "fulfilled") cuaDriver = cd.value;
  }

  async function installAgentBrowser() {
    if (installingBrowser || agentBrowser?.installed) return;
    installingBrowser = true;
    try {
      await api.invoke("agentBrowser:install");
      await loadComputerUse();
    } finally {
      installingBrowser = false;
    }
  }

  async function grantCuaPermissions() {
    if (grantingCua) return;
    grantingCua = true;
    try {
      await api.invoke("cuaDriver:grantPermissions");
      // Grant is interactive; re-poll shortly so the badges reflect the result.
      setTimeout(() => void loadComputerUse(), 3000);
    } finally {
      grantingCua = false;
    }
  }
</script>

<div class="mb-3">
  <h2 class="text-sm text-fg">Computer use</h2>
  <p class="text-xs text-faint">
    Lets the agent drive real apps when no CLI/API path exists. Web pages
    use the native <code>agent_browser</code> tool; native macOS apps use
    the <code>cua-driver</code> (background, no focus steal). Run the
    checks below to install + grant access.
  </p>
</div>

<div class="flex flex-col gap-3">
  <!-- 1. agent-browser engine binary -->
  <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
    <div class="min-w-0">
      <p class="text-xs text-fg">agent-browser engine</p>
      <p class="text-[11px] text-fainter">
        {#if agentBrowser?.binaryVersion}
          <code>agent-browser {agentBrowser.binaryVersion}</code> found on PATH
        {:else}
          Binary not on PATH — install with <code>npm i -g agent-browser</code>
        {/if}
      </p>
    </div>
    {#if agentBrowser?.binaryVersion}
      <Check size={16} class="text-emerald-500" />
    {:else}
      <CircleSlash size={16} class="text-fainter" />
    {/if}
  </div>

  <!-- 2. pi-agent-browser-native package -->
  <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
    <div class="min-w-0 flex-1">
      <p class="text-xs text-fg">Native <code>agent_browser</code> tool</p>
      <p class="text-[11px] text-fainter">
        {#if agentBrowser?.installed}
          <code>npm:pi-agent-browser-native</code> installed — restart pi to load
        {:else}
          Not installed — exposes the typed browser tool
        {/if}
      </p>
    </div>
    {#if agentBrowser?.installed}
      <Check size={16} class="text-emerald-500" />
    {:else}
      <button
        class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
        onclick={installAgentBrowser}
        disabled={installingBrowser}
        data-testid="install-agent-browser"
      >
        {installingBrowser ? "Installing…" : "Install"}
      </button>
    {/if}
  </div>

  <!-- 3. CuaDriver.app -->
  <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
    <div class="min-w-0">
      <p class="text-xs text-fg">Cua Driver</p>
      <p class="text-[11px] text-fainter">
        {#if cuaDriver?.installed}
          <code>CuaDriver.app{cuaDriver.version ? " v" + cuaDriver.version : ""}</code> installed
        {:else}
          Not installed — native macOS desktop automation
        {/if}
      </p>
    </div>
    {#if cuaDriver?.installed}
      <Check size={16} class="text-emerald-500" />
    {:else}
      <CircleSlash size={16} class="text-fainter" />
    {/if}
  </div>

  <!-- 4. Cua Driver permissions -->
  <div class="flex items-center justify-between gap-3 rounded-md bg-surface-2/40 px-3 py-2">
    <div class="min-w-0 flex-1">
      <p class="text-xs text-fg">macOS Accessibility + Screen Recording</p>
      <p class="text-[11px] text-fainter">
        {#if cuaDriver?.installed}
          {#if cuaDriver.accessibility === "granted" && cuaDriver.screenRecording === "granted"}
            Both permissions granted
          {:else if cuaDriver.accessibility === "unknown" || cuaDriver.screenRecording === "unknown"}
            Start the Cua Driver daemon, then grant access
          {:else}
            Denied — re-enable in System Settings → Privacy & Security
          {/if}
        {:else}
          Install Cua Driver first
        {/if}
      </p>
    </div>
    {#if cuaDriver?.accessibility === "granted" && cuaDriver.screenRecording === "granted"}
      <Check size={16} class="text-emerald-500" />
    {:else}
      <button
        class="settings-btn rounded-md border border-border-strong bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
        onclick={grantCuaPermissions}
        disabled={grantingCua || !cuaDriver?.installed}
        data-testid="grant-cua-permissions"
      >
        {grantingCua ? "Opening…" : "Grant access"}
      </button>
    {/if}
  </div>

  {#if computerUseReady}
    <p class="text-xs text-emerald-500" data-testid="computer-use-ready">
      ✓ Computer use is set up. The agent will prefer programmatic paths,
      then <code>agent_browser</code> for web, then <code>cua-driver</code> for native desktop.
    </p>
  {:else}
    <p class="text-xs text-faint">
      Computer use is optional. The agent prefers CLI/API/connector paths; it only
      drives UI when no programmatic route exists.
    </p>
  {/if}
</div>
