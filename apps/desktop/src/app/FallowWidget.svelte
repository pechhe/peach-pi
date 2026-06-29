<script lang="ts">
  import type { FallowProjectStatus, FallowReport, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { piSettings } from "../stores/pi-settings.svelte";
  import { portal } from "../lib/portal";
  import ScanLine from "@lucide/svelte/icons/scan-line";
  import Check from "@lucide/svelte/icons/check";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";

  let { thread, onSelectThread }: {
    thread: Thread;
    /** Navigate to the cleanup thread once it's created. */
    onSelectThread?: (threadId: string) => void;
  } = $props();

  let status = $state<FallowProjectStatus | null>(null);
  let report = $state<FallowReport | null>(null);
  let installing = $state(false);
  let running = $state(false);

  // Popdown state. `anchorEl` is the trigger button so the popover can
  // position itself beneath it; portal escapes the topbar's overflow clip.
  let open = $state(false);
  let anchorEl: HTMLButtonElement | null = $state(null);
  let popoverEl: HTMLDivElement | null = $state(null);
  let pos = $state<{ top: number; left: number }>({ top: -9999, left: -9999 });

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

  // Position the popdown beneath the trigger whenever it's open.
  $effect(() => {
    if (!open || !anchorEl) return;
    const measure = () => {
      const r = anchorEl!.getBoundingClientRect();
      const pw = 264;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      pos = { top: r.bottom + 4, left };
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  });

  // Total dead-code count for the chip badge.
  const deadTotal = $derived(
    report
      ? report.counts.unusedFiles +
        report.counts.unusedExports +
        report.counts.unusedTypes +
        report.counts.unusedClassMembers +
        report.counts.unusedDependencies +
        report.counts.unlistedDependencies +
        report.counts.duplicateExports +
        report.counts.unusedComponentProps
      : 0,
  );

  function toggle() {
    if (!status?.installed) {
      // Not installed yet — install straight away (no popover needed).
      void install();
      return;
    }
    open = !open;
  }

  function onWindowClick(e: MouseEvent) {
    if (!open) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (popoverEl && popoverEl.contains(target)) return;
    if (anchorEl && anchorEl.contains(target)) return; // let the toggle button handle it
    open = false;
  }

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
    open = false;
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (open = false)} onclick={onWindowClick} />

{#if piSettings.topbar.fallow && thread.projectId && status}
  {#if status.installed}
    <button
      type="button"
      bind:this={anchorEl}
      class="relative rounded px-2 py-0.5 text-faint transition-colors hover:bg-surface hover:text-fg-soft"
      onclick={toggle}
      title="Fallow dead-code scan"
      data-testid="fallow-toggle"
      aria-expanded={open}
    >
      <ScanLine size={14} />
      {#if deadTotal > 0}
        <span
          class="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-semibold leading-none text-amber-950"
        >{deadTotal}</span>
      {/if}
    </button>

    {#if open}
      <div
        bind:this={popoverEl}
        use:portal
        class="fixed w-[264px] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xl z-60"
        style="top: {pos.top}px; left: {pos.left}px"
        data-testid="fallow-popover"
      >
        <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <ScanLine size={12} /> Fallow
          </span>
          {#if deadTotal > 0}
            <span class="num-badge">{deadTotal} dead</span>
          {:else if report?.ok}
            <span class="flex items-center gap-1 text-[10px] text-emerald-500"><Check size={11} /> clean</span>
          {/if}
        </div>

        <div class="px-3 py-2">
          {#if running}
            <div class="flex items-center gap-2 py-2 text-[11px] text-muted">
              <RefreshCw size={12} class="animate-spin" /> Scanning…
            </div>
          {:else if report?.ok}
            <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
              {#each [
                ["Unused files", report.counts.unusedFiles],
                ["Unused exports", report.counts.unusedExports],
                ["Unused types", report.counts.unusedTypes],
                ["Unused class members", report.counts.unusedClassMembers],
                ["Unused deps", report.counts.unusedDependencies],
                ["Unlisted deps", report.counts.unlistedDependencies],
                ["Duplicate exports", report.counts.duplicateExports],
                ["Unused props", report.counts.unusedComponentProps],
              ] as [label, n]}
                <dt class="text-muted">{label}</dt>
                <dd class="text-right font-mono {n > 0 ? "text-amber-400" : "text-faint"}">{n}</dd>
              {/each}
            </dl>
          {:else}
            <p class="py-2 text-[11px] text-muted">
              Scan for unused files, exports, dependencies, and more.
            </p>
          {/if}
        </div>

        <div class="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <button
            class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
            onclick={run}
            disabled={running}
            data-testid="fallow-run"
          >
            <RefreshCw size={12} class={running ? "animate-spin" : ""} />
            {running ? "Scanning…" : report ? "Re-scan" : "Scan"}
          </button>
          {#if report?.ok}
            <button
              class="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-fg transition-colors hover:brightness-110 disabled:opacity-50"
              onclick={launchThread}
              data-testid="fallow-launch"
            >
              Clean up <ArrowUpRight size={12} />
            </button>
          {/if}
        </div>
      </div>
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

<style>
  .z-60 { z-index: 60; }
</style>
