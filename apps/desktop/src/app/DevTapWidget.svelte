<script lang="ts">
  import type { DevTapProjectStatus, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import Activity from "@lucide/svelte/icons/activity";

  let { thread, onSelectThread }: {
    thread: Thread;
    /** Navigate to the install thread once it's created. */
    onSelectThread?: (threadId: string) => void;
  } = $props();

  let status = $state<DevTapProjectStatus | null>(null);
  let installing = $state(false);

  // Re-check on thread switch and on status changes (so a finished install
  // flips the chip without a manual refresh).
  $effect(() => {
    void thread.id;
    void thread.status;
    const pid = thread.projectId;
    if (!pid) {
      status = null;
      return;
    }
    void api
      .invoke("devtap:projectStatus", pid)
      .then((s) => (status = s))
      .catch(() => (status = null));
  });

  const INSTALL_PROMPT =
    "Install DevTap into this project. Use the devtap-install skill: detect the stack " +
    "(Electron or Node), copy the matching adapter from the skill's adapters/ directory " +
    "into the project, wire the entry point, add `.pi/devtap.jsonl` and `.pi/devtap/` to " +
    ".gitignore, and verify by running with DEV_TAP=1. Keep all instrumentation dev-only — " +
    "no production behavior change.";

  // Installed-state click: report status as a toast so it's obvious at a glance.
  function showStatus() {
    if (!status) return;
    const msg = `DevTap installed in this project.\n${status.tapPath ?? ""}` +
      (status.extensionInstalled ? "" : "\nReader extension missing — install ~/.pi/agent/extensions/devtap");
    extensionUi.notify(msg, undefined, status.extensionInstalled ? "info" : "warning", Activity);
  }

  async function install() {
    const pid = thread.projectId;
    if (!pid || installing) return;
    installing = true;
    try {
      const t = await api.invoke("threads:create", pid);
      await api.invoke("threads:prompt", t.id, INSTALL_PROMPT);
      onSelectThread?.(t.id);
    } finally {
      installing = false;
    }
  }
</script>

{#if status}
  {#if status.installed}
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted hover:text-fg-soft"
      onclick={showStatus}
      data-testid="devtap-installed"
    >
      <Activity size={11} /> DevTap ✓
    </button>
  {:else}
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"
      onclick={install}
      disabled={installing}
      data-testid="devtap-install"
    >
      <Activity size={12} />
      {installing ? "Installing…" : "Install DevTap"}
    </button>
  {/if}
{/if}
