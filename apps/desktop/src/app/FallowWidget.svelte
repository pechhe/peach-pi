<script lang="ts">
  import type { FallowProjectStatus, FallowReport, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { piSettings } from "../stores/pi-settings.svelte";
  import ScanLine from "@lucide/svelte/icons/scan-line";

  let { thread, onSelectThread }: {
    thread: Thread;
    /** Navigate to the cleanup thread once it's created. */
    onSelectThread?: (threadId: string) => void;
  } = $props();

  let status = $state<FallowProjectStatus | null>(null);
  let report = $state<FallowReport | null>(null);
  let installing = $state(false);
  let running = $state(false);

  // Re-check on thread switch (only if the topbar toggle is on).
  $effect(() => {
    void thread.id;
    void thread.status;
    const pid = thread.projectId;
    if (!pid || !piSettings.topbar.fallow) {
      status = null;
      report = null;
      return;
    }
    void api
      .invoke("fallow:projectStatus", pid)
      .then((s) => (status = s))
      .catch(() => (status = null));
  });

  async function install() {
    const pid = thread.projectId;
    if (!pid || installing) return;
    installing = true;
    try {
      status = await api.invoke("fallow:install", pid);
    } catch (err) {
      extensionUi.notify(`Fallow install failed: ${String(err)}`, undefined, "error", ScanLine);
    } finally {
      installing = false;
    }
  }

  async function run() {
    const pid = thread.projectId;
    if (!pid || running) return;
    running = true;
    try {
      report = await api.invoke("fallow:run", pid);
    } catch (err) {
      extensionUi.notify(`Fallow run failed: ${String(err)}`, undefined, "error", ScanLine);
    } finally {
      running = false;
    }
  }

  function launchThread() {
    const pid = thread.projectId;
    if (!pid || !report) return;
    const c = report.counts;
    const summary = [
      `${c.unusedFiles} unused files`,
      `${c.unusedExports} unused exports`,
      `${c.unusedTypes} unused types`,
      `${c.unusedClassMembers} unused class members`,
      `${c.unusedDependencies} unused deps`,
      `${c.unlistedDependencies} unlisted deps`,
      `${c.duplicateExports} duplicate-export pairs`,
      `${c.unusedComponentProps} unused props`,
    ].join(", ");
    const prompt =
      `Fallow dead-code scan found: ${summary}.\n` +
      `Full JSON report:\n\n${report.json ?? "(no JSON capture)"}\n\n` +
      `Triage and clean up this dead code. Prioritize: (1) genuinely unused files/exports/types, ` +
      `(2) unused dependencies, (3) duplicate exports, (4) unused component props. ` +
      `Caveat: fallow is static-analysis-only. Some "unused" class members may be wired via ` +
      `reflection (e.g. IPC handler registries) — verify each elimination before deleting. ` +
      `Do NOT touch code outside the scope of the findings. Do NOT run \`fallow fix\` blindly; ` +
      `make surgical edits and re-run \`fallow dead-code\` to confirm counts drop.`;
    void api
      .invoke("threads:create", pid)
      .then((t) => api.invoke("threads:prompt", t.id, prompt).then(() => onSelectThread?.(t.id)));
  }
</script>

{#if piSettings.topbar.fallow && thread.projectId && status}
  {#if status.installed}
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted hover:text-fg-soft disabled:opacity-50"
      onclick={run}
      disabled={running}
      title="Run fallow dead-code scan"
      data-testid="fallow-run"
    >
      <ScanLine size={11} />
      {running ? "Scanning…" : report ? `${report.counts.unusedFiles + report.counts.unusedExports} dead` : "Fallow ✓"}
    </button>
    {#if report?.ok}
      <button
        type="button"
        class="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft"
        onclick={launchThread}
        title="Launch a cleanup thread with this report"
        data-testid="fallow-launch"
      >
        Clean up ↗
      </button>
    {/if}
  {:else}
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"
      onclick={install}
      disabled={installing}
      data-testid="fallow-install"
    >
      <ScanLine size={12} />
      {installing ? "Installing…" : "Install Fallow"}
    </button>
  {/if}
{/if}
